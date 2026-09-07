import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  NotebookDatabase,
  NotebookConflictError,
  parseNotebookBackup,
  type LearningNote,
} from '@/lib/learning/notebook';

const note: LearningNote = {
  courseId: 'course-a',
  sceneId: 'scene-a',
  courseTitle: 'A course',
  sceneTitle: 'A scene',
  excerpt: 'Original explanation',
  text: 'My own note',
  bookmarked: true,
  reviewLater: true,
  createdAt: 1,
  updatedAt: 1,
  revision: 1,
};
const db = new NotebookDatabase('notebook-unit-test');
afterEach(async () => {
  await db.notes.clear();
});

describe('personal notebook persistence', () => {
  it('keeps personal notes separate by course and survives reopening', async () => {
    await db.save(note, 0);
    await db.save({ ...note, courseId: 'course-b', text: 'Other course' }, 0);
    db.close();
    await db.open();
    expect((await db.notes.get(['course-a', 'scene-a']))?.text).toBe('My own note');
    expect(await db.notes.count()).toBe(2);
  });
  it('rejects a stale writer rather than overwriting another tab', async () => {
    await db.save(note, 0);
    await db.save({ ...note, text: 'Newer note', revision: 2 }, 1);
    await expect(db.save({ ...note, text: 'Stale note', revision: 2 }, 1)).rejects.toBeInstanceOf(
      NotebookConflictError,
    );
    expect((await db.notes.get(['course-a', 'scene-a']))?.text).toBe('Newer note');
  });
  it('imports only missing notes and does not replace existing work', async () => {
    await db.save(note, 0);
    const count = await db.importMissing([
      { ...note, text: 'Import overwrite' },
      { ...note, sceneId: 'scene-b' },
    ]);
    expect(count).toBe(1);
    expect((await db.notes.get(['course-a', 'scene-a']))?.text).toBe('My own note');
  });
  it('round trips a backup without allowing extra fields or malformed data', () => {
    const backup = { format: 'openmaic-personal-notebook', version: 1, notes: [note] };
    expect(parseNotebookBackup(JSON.stringify(backup))).toEqual(backup);
    expect(() =>
      parseNotebookBackup(JSON.stringify({ ...backup, notes: [{ ...note, text: 5 }] })),
    ).toThrow();
    expect(() => parseNotebookBackup(JSON.stringify({ ...backup, notes: [note, note] }))).toThrow();
    expect(() => parseNotebookBackup(JSON.stringify({ ...backup, version: 7 }))).toThrow();
  });
});
