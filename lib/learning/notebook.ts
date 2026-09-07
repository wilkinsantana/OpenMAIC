import Dexie, { type Table } from 'dexie';
import { learningRequest, usesServerLearningStorage } from './server-storage';

export interface LearningNote {
  courseId: string;
  sceneId: string;
  courseTitle: string;
  sceneTitle: string;
  excerpt: string;
  text: string;
  bookmarked: boolean;
  reviewLater: boolean;
  createdAt: number;
  updatedAt: number;
  revision: number;
}

export interface NotebookBackup {
  format: 'openmaic-personal-notebook';
  version: 1;
  notes: LearningNote[];
}

export function noteKey(note: Pick<LearningNote, 'courseId' | 'sceneId'>): string {
  return JSON.stringify([note.courseId, note.sceneId]);
}

export class NotebookConflictError extends Error {
  constructor() {
    super('This note changed in another tab. Export your draft before reloading.');
  }
}

export class NotebookDatabase extends Dexie {
  notes!: Table<LearningNote, [string, string]>;
  constructor(name = 'OpenMAIC-Personal-Notebook') {
    super(name);
    this.version(1).stores({ notes: '[courseId+sceneId], courseId, updatedAt' });
  }
  async save(note: LearningNote, expectedRevision: number): Promise<void> {
    if (usesServerLearningStorage()) {
      await learningRequest('note', undefined, { record: note, expectedRevision });
      return;
    }
    await this.transaction('rw', this.notes, async () => {
      const existing = await this.notes.get([note.courseId, note.sceneId]);
      if ((existing?.revision ?? 0) !== expectedRevision) throw new NotebookConflictError();
      await this.notes.put(note);
    });
  }
  async list(): Promise<LearningNote[]> {
    if (!usesServerLearningStorage()) return this.notes.toArray();
    await this.importMissing(await this.notes.toArray());
    return learningRequest('note');
  }
  /** Imports missing records only. Existing personal work is never overwritten. */
  async importMissing(notes: LearningNote[]): Promise<number> {
    if (usesServerLearningStorage()) {
      let count = 0;
      for (const note of notes) {
        if (await learningRequest('note', noteKey(note))) continue;
        await learningRequest('note', undefined, {
          record: { ...note, revision: Math.max(1, note.revision) },
          expectedRevision: 0,
        });
        count++;
      }
      return count;
    }
    return this.transaction('rw', this.notes, async () => {
      let imported = 0;
      for (const note of notes) {
        if (!(await this.notes.get([note.courseId, note.sceneId]))) {
          await this.notes.add(note);
          imported++;
        }
      }
      return imported;
    });
  }
}

let database: NotebookDatabase | undefined;
export function notebookDatabase(): NotebookDatabase {
  return (database ??= new NotebookDatabase());
}

export function parseNotebookBackup(text: string): NotebookBackup {
  if (text.length > 5_000_000) throw new Error('Notebook backup is too large');
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('Invalid notebook backup');
  const backup = data as Partial<NotebookBackup>;
  if (
    backup.format !== 'openmaic-personal-notebook' ||
    backup.version !== 1 ||
    !Array.isArray(backup.notes) ||
    backup.notes.length > 2000
  )
    throw new Error('Invalid notebook backup');
  const keys = new Set<string>();
  const notes = backup.notes.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid note');
    const n = value as Record<string, unknown>;
    for (const field of ['courseId', 'sceneId', 'courseTitle', 'sceneTitle', 'excerpt', 'text']) {
      if (
        typeof n[field] !== 'string' ||
        (n[field] as string).length > (field === 'text' ? 100_000 : 2000)
      )
        throw new Error('Invalid note text');
    }
    if (
      !n.courseId ||
      !n.sceneId ||
      typeof n.bookmarked !== 'boolean' ||
      typeof n.reviewLater !== 'boolean'
    )
      throw new Error('Invalid note flags');
    for (const field of ['createdAt', 'updatedAt', 'revision']) {
      if (
        typeof n[field] !== 'number' ||
        !Number.isSafeInteger(n[field]) ||
        (n[field] as number) < 0
      )
        throw new Error('Invalid note revision');
    }
    const note: LearningNote = {
      courseId: n.courseId as string,
      sceneId: n.sceneId as string,
      courseTitle: n.courseTitle as string,
      sceneTitle: n.sceneTitle as string,
      excerpt: n.excerpt as string,
      text: n.text as string,
      bookmarked: n.bookmarked,
      reviewLater: n.reviewLater,
      createdAt: n.createdAt as number,
      updatedAt: n.updatedAt as number,
      revision: n.revision as number,
    };
    const key = noteKey(note);
    if (keys.has(key)) throw new Error('Duplicate note');
    keys.add(key);
    return note;
  });
  return { format: 'openmaic-personal-notebook', version: 1, notes };
}

export function notebookMarkdown(notes: LearningNote[]): string {
  return notes
    .map((note) => {
      // Titles cannot inject extra headings; Markdown in the learner's own note is preserved.
      const title = note.sceneTitle.replace(/[\r\n]/g, ' ');
      const course = note.courseTitle.replace(/[\r\n]/g, ' ');
      return `## ${title}\n\nCourse: ${course}\n\n${note.text}\n`;
    })
    .join('\n---\n\n');
}
