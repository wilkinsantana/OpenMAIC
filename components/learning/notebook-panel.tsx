'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { BookMarked, Bookmark, Clock3, Download, Upload, X } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store/stage';
import { useNotebookStore } from '@/lib/learning/notebook-store';
import {
  notebookDatabase,
  notebookMarkdown,
  noteKey,
  parseNotebookBackup,
  type LearningNote,
  type NotebookBackup,
} from '@/lib/learning/notebook';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'bookmarks' | 'review';

function download(content: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function NotebookPanel({ onNavigateScene }: { onNavigateScene?: (id: string) => unknown }) {
  const { t } = useI18n();
  const stage = useStageStore((state) => state.stage);
  const scenes = useStageStore((state) => state.scenes);
  const currentSceneId = useStageStore((state) => state.currentSceneId);
  const notebook = useNotebookStore();
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [allCourses, setAllCourses] = useState(false);
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const loadNotebook = notebook.load;
  useEffect(() => {
    if (open) void loadNotebook();
  }, [open, loadNotebook]);
  if (!stage) return null;
  const currentScene = scenes.find((scene) => scene.id === currentSceneId);
  const currentKey = currentScene
    ? noteKey({ courseId: stage.id, sceneId: currentScene.id })
    : null;
  const key = selectedKey ?? currentKey;
  const stored = key ? notebook.notes[key] : undefined;
  const note: LearningNote | undefined =
    stored ??
    (currentScene && !selectedKey
      ? {
          courseId: stage.id,
          sceneId: currentScene.id,
          courseTitle: stage.name,
          sceneTitle: currentScene.title,
          excerpt: (currentScene.actions ?? [])
            .filter((action) => action.type === 'speech')
            .map((action) => (action.type === 'speech' ? action.text : ''))
            .join(' ')
            .slice(0, 500),
          text: '',
          bookmarked: false,
          reviewLater: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          revision: 0,
        }
      : undefined);
  const target =
    note?.courseId === stage.id ? scenes.find((scene) => scene.id === note.sceneId) : undefined;
  const state = key ? notebook.states[key] : undefined;
  const records = Object.values(notebook.notes).sort((a, b) => b.updatedAt - a.updatedAt);
  const visible = records.filter(
    (entry) =>
      (allCourses || entry.courseId === stage.id) &&
      (filter !== 'bookmarks' || entry.bookmarked) &&
      (filter !== 'review' || entry.reviewLater) &&
      `${entry.courseTitle} ${entry.sceneTitle} ${entry.text}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  function edit(patch: Partial<Pick<LearningNote, 'text' | 'bookmarked' | 'reviewLater'>>) {
    if (!note || !notebook.loaded) return;
    notebook.edit({ ...note, ...patch, updatedAt: Date.now() });
  }
  function backup() {
    const data: NotebookBackup = {
      format: 'openmaic-personal-notebook',
      version: 1,
      notes: records,
    };
    download(JSON.stringify(data, null, 2), 'application/json', 'openmaic-personal-notebook.json');
  }
  const buttonClass =
    'inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50';
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setSelectedKey(null);
          setMessage('');
        }
      }}
      modal={false}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          title={t('learningNotebook.title')}
          aria-label={t('learningNotebook.title')}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <BookMarked className="size-4" />
          <span className="hidden lg:inline">{t('learningNotebook.title')}</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          data-testid="learning-notebook"
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[440px] flex-col border-l bg-background text-foreground shadow-2xl outline-none"
        >
          <div className="flex items-start justify-between gap-3 border-b p-4">
            <div>
              <Dialog.Title className="text-lg font-semibold">
                {t('learningNotebook.title')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {t('learningNotebook.privateNotice')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t('learningNotebook.close')}
                className="rounded p-1 hover:bg-muted"
              >
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {notebook.loadError && (
              <div role="alert" className="text-sm text-destructive">
                {t('learningNotebook.loadError')}{' '}
                <button className={buttonClass} onClick={() => void notebook.load()}>
                  {t('learningNotebook.retry')}
                </button>
              </div>
            )}
            <button
              type="button"
              className={buttonClass}
              disabled={!currentScene}
              onClick={() => setSelectedKey(null)}
            >
              {t('learningNotebook.currentSlide')}
            </button>
            {note ? (
              <section
                aria-label={t('learningNotebook.editor')}
                className="space-y-3 rounded-lg border p-3"
              >
                <div>
                  <p className="text-xs text-muted-foreground">{note.courseTitle}</p>
                  <h3 className="font-medium">{target?.title ?? note.sceneTitle}</h3>
                </div>
                {!target && (
                  <p className="text-xs text-amber-600">
                    {t(
                      note.courseId === stage.id
                        ? 'learningNotebook.missingScene'
                        : 'learningNotebook.otherCourse',
                    )}
                  </p>
                )}
                {target && target.title !== note.sceneTitle && (
                  <p className="text-xs text-muted-foreground">
                    {t('learningNotebook.originalTitle', { title: note.sceneTitle })}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={note.bookmarked}
                    disabled={!notebook.loaded}
                    className={cn(buttonClass, note.bookmarked && 'bg-primary/10 text-primary')}
                    onClick={() => edit({ bookmarked: !note.bookmarked })}
                  >
                    <Bookmark className="size-3.5" />
                    {t('learningNotebook.bookmark')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={note.reviewLater}
                    disabled={!notebook.loaded}
                    className={cn(buttonClass, note.reviewLater && 'bg-primary/10 text-primary')}
                    onClick={() => edit({ reviewLater: !note.reviewLater })}
                  >
                    <Clock3 className="size-3.5" />
                    {t('learningNotebook.reviewLater')}
                  </button>
                  {target && onNavigateScene && (
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => {
                        setOpen(false);
                        onNavigateScene(target.id);
                      }}
                    >
                      {t('learningNotebook.goToSlide')}
                    </button>
                  )}
                </div>
                <label className="block text-sm" htmlFor="personal-note-text">
                  {t('learningNotebook.noteLabel')}
                </label>
                <textarea
                  id="personal-note-text"
                  value={note.text}
                  disabled={!notebook.loaded}
                  maxLength={100_000}
                  onChange={(event) => edit({ text: event.target.value })}
                  placeholder={t('learningNotebook.placeholder')}
                  className="min-h-40 w-full resize-y rounded-md border bg-background p-3 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-primary"
                />
                <p
                  role="status"
                  className={cn(
                    'text-xs',
                    state === 'error' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {t(
                    state === 'error'
                      ? 'learningNotebook.saveError'
                      : state === 'saving'
                        ? 'learningNotebook.saving'
                        : stored
                          ? 'learningNotebook.saved'
                          : 'learningNotebook.autosave',
                  )}
                </p>
                {state === 'error' && key && (
                  <button className={buttonClass} onClick={() => notebook.retry(key)}>
                    {t('learningNotebook.retry')}
                  </button>
                )}
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">{t('learningNotebook.chooseSlide')}</p>
            )}
            <section aria-label={t('learningNotebook.library')} className="space-y-3">
              <h3 className="text-sm font-semibold">{t('learningNotebook.library')}</h3>
              <input
                aria-label={t('learningNotebook.search')}
                placeholder={t('learningNotebook.search')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                {(['all', 'bookmarks', 'review'] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={filter === value}
                    className={cn(buttonClass, filter === value && 'bg-primary/10 text-primary')}
                    onClick={() => setFilter(value)}
                  >
                    {t(`learningNotebook.filter.${value}`)}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={allCourses}
                  onChange={(event) => setAllCourses(event.target.checked)}
                />
                {t('learningNotebook.allCourses')}
              </label>
              {!visible.length && (
                <p className="text-sm text-muted-foreground">{t('learningNotebook.empty')}</p>
              )}
              <ul className="space-y-2">
                {visible.map((entry) => (
                  <li key={noteKey(entry)}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(noteKey(entry))}
                      className={cn(
                        'w-full rounded-md border p-3 text-left hover:bg-muted',
                        key === noteKey(entry) && 'border-primary',
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {entry.bookmarked && (
                          <Bookmark
                            aria-label={t('learningNotebook.bookmark')}
                            className="size-3.5"
                          />
                        )}
                        {entry.reviewLater && (
                          <Clock3
                            aria-label={t('learningNotebook.reviewLater')}
                            className="size-3.5"
                          />
                        )}
                        {entry.courseId === stage.id
                          ? (scenes.find((scene) => scene.id === entry.sceneId)?.title ??
                            entry.sceneTitle)
                          : entry.sceneTitle}
                      </span>
                      {allCourses && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {entry.courseTitle}
                        </span>
                      )}
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {entry.text.slice(0, 120) || t('learningNotebook.noText')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <div className="space-y-2 border-t p-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={backup}>
                <Download className="size-3.5" />
                {t('learningNotebook.backup')}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() =>
                  download(notebookMarkdown(visible), 'text/markdown', 'learning-notes.md')
                }
              >
                {t('learningNotebook.markdown')}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={
                  !notebook.loaded ||
                  Object.values(notebook.states).some((value) => value !== 'saved')
                }
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="size-3.5" />
                {t('learningNotebook.import')}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t('learningNotebook.backupNotice')}</p>
            {message && (
              <p role="status" className="text-xs">
                {message}
              </p>
            )}
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label={t('learningNotebook.import')}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                try {
                  if (file.size > 5_000_000) throw new Error('Too large');
                  const backup = parseNotebookBackup(await file.text());
                  const count = await notebookDatabase().importMissing(backup.notes);
                  await notebook.load();
                  setMessage(t('learningNotebook.imported', { count }));
                } catch {
                  setMessage(t('learningNotebook.importError'));
                }
              }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
