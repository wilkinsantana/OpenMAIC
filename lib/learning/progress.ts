import Dexie, { type Table } from 'dexie';
import { learningRequest, usesServerLearningStorage } from './server-storage';

export type LearningStatus = 'in-progress' | 'completed' | 'needs-review';
export interface ExerciseProgress {
  courseId: string;
  sceneId: string;
  sourceHash: string;
  courseTitle: string;
  sceneTitle: string;
  code: string;
  savedAttempt: string | null;
  assisted: boolean;
  status: LearningStatus;
  updatedAt: number;
}
export interface CourseVisit {
  courseId: string;
  courseTitle: string;
  sceneId: string;
  updatedAt: number;
}
class ProgressDatabase extends Dexie {
  attempts!: Table<ExerciseProgress, [string, string, string]>;
  visits!: Table<CourseVisit, string>;
  constructor() {
    super('OpenMAIC-Learning-Progress');
    this.version(1).stores({
      attempts: '[courseId+sceneId+sourceHash], courseId, updatedAt',
      visits: 'courseId, updatedAt',
    });
  }
}
let database: ProgressDatabase | undefined;
export function progressDatabase() {
  return (database ??= new ProgressDatabase());
}
export async function exerciseSourceHash(html: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
export function validExerciseDraft(
  value: unknown,
): value is Pick<ExerciseProgress, 'code' | 'savedAttempt' | 'assisted' | 'status'> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === 'string' &&
    v.code.length <= 100_000 &&
    (v.savedAttempt === null ||
      (typeof v.savedAttempt === 'string' && v.savedAttempt.length <= 100_000)) &&
    typeof v.assisted === 'boolean' &&
    ['in-progress', 'completed', 'needs-review'].includes(String(v.status))
  );
}

export async function readAttempt(
  key: [string, string, string],
): Promise<ExerciseProgress | undefined> {
  if (!usesServerLearningStorage()) return progressDatabase().attempts.get(key);
  const remote = await learningRequest('attempt', JSON.stringify(key));
  if (remote) return remote;
  const local = await progressDatabase().attempts.get(key);
  if (local) {
    await learningRequest('attempt', undefined, { record: local, expectedRevision: 0 });
    return local;
  }
}
export async function saveAttempt(
  record: ExerciseProgress,
  expectedRevision: number,
): Promise<void> {
  if (usesServerLearningStorage()) {
    await learningRequest('attempt', undefined, { record, expectedRevision });
    return;
  }
  const db = progressDatabase();
  await db.transaction('rw', db.attempts, async () => {
    const old = await db.attempts.get([record.courseId, record.sceneId, record.sourceHash]);
    if ((old?.updatedAt ?? 0) !== expectedRevision)
      throw new Error('Attempt changed in another tab');
    await db.attempts.put(record);
  });
}
export async function saveVisit(record: CourseVisit): Promise<void> {
  if (!usesServerLearningStorage()) {
    await progressDatabase().visits.put(record);
    return;
  }
  const old = await learningRequest('visit', record.courseId);
  await learningRequest('visit', undefined, {
    record: { ...record, updatedAt: Math.max(record.updatedAt, (old?.updatedAt ?? 0) + 1) },
    expectedRevision: old?.updatedAt ?? 0,
  });
}
export async function listProgress(): Promise<[ExerciseProgress[], CourseVisit[]]> {
  const db = progressDatabase();
  if (!usesServerLearningStorage())
    return Promise.all([
      db.attempts.orderBy('updatedAt').reverse().toArray(),
      db.visits.orderBy('updatedAt').reverse().toArray(),
    ]);
  for (const row of await db.attempts.toArray())
    await readAttempt([row.courseId, row.sceneId, row.sourceHash]);
  for (const row of await db.visits.toArray())
    if (!(await learningRequest('visit', row.courseId)))
      await learningRequest('visit', undefined, { record: row, expectedRevision: 0 });
  const rows = await Promise.all([learningRequest('attempt'), learningRequest('visit')]);
  return rows.map((values) =>
    values.sort((a: ExerciseProgress, b: ExerciseProgress) => b.updatedAt - a.updatedAt),
  ) as [ExerciseProgress[], CourseVisit[]];
}
