import { db, type AudioFileRecord, type MediaFileRecord } from '@/lib/utils/database';
import { learningRequest, usesServerLearningStorage } from '@/lib/learning/server-storage';
import { getAssetPool } from './asset-pool';
type Row = AudioFileRecord | MediaFileRecord;
async function persist(kind: 'audio' | 'media', row: Row) {
  if (usesServerLearningStorage()) {
    const old = await learningRequest(kind, row.id);
    const pool = getAssetPool();
    const assetRef = row.blob.size ? await pool.put(row.blob, { contentType: row.blob.type }) : '';
    const posterRef =
      'poster' in row && row.poster
        ? await pool.put(row.poster, { contentType: row.poster.type })
        : undefined;
    const { blob, ...meta } = row;
    void blob;
    if ('poster' in meta) delete meta.poster;
    await learningRequest(kind, undefined, {
      record: {
        ...meta,
        courseId: row.stageId,
        assetRef,
        posterRef,
        updatedAt: Math.max(Date.now(), (old?.updatedAt ?? 0) + 1),
      },
      expectedRevision: old?.updatedAt ?? 0,
    });
  }
}
export async function putLegacyAudio(row: AudioFileRecord) {
  await persist('audio', row);
  return db.audioFiles.put(row);
}
export async function putLegacyMedia(row: MediaFileRecord) {
  await persist('media', row);
  return db.mediaFiles.put(row);
}
async function read(kind: 'audio' | 'media', id: string): Promise<Row | undefined> {
  const local = kind === 'audio' ? await db.audioFiles.get(id) : await db.mediaFiles.get(id);
  if (local || !usesServerLearningStorage()) return local;
  const remote = await learningRequest(kind, id);
  if (!remote) return undefined;
  const pool = getAssetPool();
  async function bytes(ref: string) {
    const url = await pool.resolve(ref);
    if (!url) throw new Error('Stored media missing');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Media download failed');
      return await response.blob();
    } finally {
      await pool.release(ref);
    }
  }
  const { assetRef, posterRef, courseId, updatedAt, ...meta } = remote;
  void courseId;
  void updatedAt;
  const row = {
    ...meta,
    blob: assetRef ? await bytes(assetRef) : new Blob([]),
    ...(posterRef ? { poster: await bytes(posterRef) } : {}),
  };
  if (kind === 'audio') await db.audioFiles.put(row);
  else await db.mediaFiles.put(row);
  return row;
}
export async function getLegacyAudio(id: string) {
  return read('audio', id) as Promise<AudioFileRecord | undefined>;
}
export async function getLegacyMedia(id: string) {
  return read('media', id) as Promise<MediaFileRecord | undefined>;
}
