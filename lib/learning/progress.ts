import Dexie, { type Table } from 'dexie';

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
