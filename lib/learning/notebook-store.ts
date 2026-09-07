import { create } from 'zustand';
import { notebookDatabase, noteKey, type LearningNote } from './notebook';

type SaveState = 'saving' | 'saved' | 'error';
interface NotebookState {
  notes: Record<string, LearningNote>;
  states: Record<string, SaveState>;
  loaded: boolean;
  loadError: boolean;
  load: () => Promise<void>;
  edit: (note: LearningNote) => void;
  retry: (key: string) => void;
}

const queues = new Map<string, Promise<void>>();
const savedRevisions = new Map<string, number>();
let loading: Promise<void> | undefined;

export const useNotebookStore = create<NotebookState>((set, get) => {
  function enqueue(key: string) {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.then(async () => {
      const draft = get().notes[key];
      if (!draft) return;
      const revision = savedRevisions.get(key) ?? 0;
      const snapshot = { ...draft, revision: revision + 1 };
      set((state) => ({ states: { ...state.states, [key]: 'saving' } }));
      try {
        await notebookDatabase().save(snapshot, revision);
        savedRevisions.set(key, snapshot.revision);
        if (get().notes[key] === draft) {
          set((state) => ({
            notes: { ...state.notes, [key]: snapshot },
            states: { ...state.states, [key]: 'saved' },
          }));
        }
      } catch {
        // Keep the unsaved draft in memory so it remains editable and exportable.
        set((state) => ({ states: { ...state.states, [key]: 'error' } }));
      }
    });
    queues.set(key, next);
    void next.finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    });
  }
  return {
    notes: {},
    states: {},
    loaded: false,
    loadError: false,
    load: async () => {
      if (loading) return loading;
      loading = (async () => {
        try {
          const rows = await notebookDatabase().notes.toArray();
          set((state) => {
            const notes = { ...state.notes };
            const states = { ...state.states };
            for (const row of rows) {
              const key = noteKey(row);
              // Never overwrite drafts or queued writes when the panel remounts.
              if (!notes[key]) {
                notes[key] = row;
                states[key] = 'saved';
                savedRevisions.set(key, row.revision);
              }
            }
            return { notes, states, loaded: true, loadError: false };
          });
        } catch {
          set({ loadError: true });
        }
      })();
      try {
        await loading;
      } finally {
        loading = undefined;
      }
    },
    edit: (note) => {
      const key = noteKey(note);
      set((state) => ({
        notes: { ...state.notes, [key]: note },
        states: { ...state.states, [key]: 'saving' },
      }));
      enqueue(key);
    },
    retry: (key) => enqueue(key),
  };
});
