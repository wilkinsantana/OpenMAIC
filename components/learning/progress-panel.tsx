'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { liveQuery } from 'dexie';
import type { ExerciseProgress, CourseVisit } from '@/lib/learning/progress';
import { useStageStore } from '@/lib/store/stage';
import { progressDatabase } from '@/lib/learning/progress';
import { useI18n } from '@/lib/hooks/use-i18n';

export function LearningVisitRecorder() {
  const stage = useStageStore((s) => s.stage);
  const sceneId = useStageStore((s) => s.currentSceneId);
  useEffect(() => {
    if (stage && sceneId)
      void progressDatabase()
        .visits.put({ courseId: stage.id, courseTitle: stage.name, sceneId, updatedAt: Date.now() })
        .catch(() => {});
  }, [stage, sceneId]);
  return null;
}
export function ProgressPanel({ onNavigateScene }: { onNavigateScene?: (id: string) => unknown }) {
  const { t } = useI18n();
  const router = useRouter();
  const stage = useStageStore((s) => s.stage);
  const scenes = useStageStore((s) => s.scenes);
  const [all, setAll] = useState(false);
  const [attempts, setAttempts] = useState<ExerciseProgress[]>([]);
  const [visits, setVisits] = useState<CourseVisit[]>([]);
  useEffect(() => {
    const a = liveQuery(() =>
      progressDatabase().attempts.orderBy('updatedAt').reverse().toArray(),
    ).subscribe({ next: setAttempts, error: () => {} });
    const v = liveQuery(() =>
      progressDatabase().visits.orderBy('updatedAt').reverse().toArray(),
    ).subscribe({ next: setVisits, error: () => {} });
    return () => {
      a.unsubscribe();
      v.unsubscribe();
    };
  }, []);
  const latest = new Map<string, NonNullable<typeof attempts>[number]>();
  for (const row of attempts ?? []) {
    const key = JSON.stringify([row.courseId, row.sceneId]);
    if (!latest.has(key)) latest.set(key, row);
  }
  const records = [...latest.values()].filter((row) => all || row.courseId === stage?.id);
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-medium">{t('learningProgress.title')}</h3>
      <p className="text-xs text-muted-foreground">{t('learningProgress.notice')}</p>
      <label className="flex gap-2 text-xs">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        {t('learningProgress.all')}
      </label>
      <ul className="space-y-2">
        {records.map((row) => (
          <li
            key={JSON.stringify([row.courseId, row.sceneId])}
            className="rounded border p-2 text-sm"
          >
            <button
              className="text-left font-medium underline"
              disabled={row.courseId === stage?.id && !scenes.some((s) => s.id === row.sceneId)}
              onClick={() =>
                row.courseId === stage?.id
                  ? onNavigateScene?.(row.sceneId)
                  : router.push(`/classroom/${encodeURIComponent(row.courseId)}`)
              }
            >
              {row.sceneTitle}
            </button>
            <p className="text-xs text-muted-foreground">
              {t(
                row.status === 'completed'
                  ? 'learningProgress.completed'
                  : row.status === 'needs-review'
                    ? 'learningProgress.review'
                    : 'learningProgress.inProgress',
              )}{' '}
              · {t(row.assisted ? 'learningProgress.assisted' : 'learningProgress.independent')}
            </p>
          </li>
        ))}
      </ul>
      {!records.length && (
        <p className="text-xs text-muted-foreground">{t('learningProgress.empty')}</p>
      )}
      <h3 className="font-medium">{t('learningProgress.continue')}</h3>
      {(visits ?? []).slice(0, 5).map((visit) => (
        <button
          key={visit.courseId}
          className="block text-left text-sm underline"
          onClick={() =>
            visit.courseId === stage?.id
              ? onNavigateScene?.(visit.sceneId)
              : router.push(`/classroom/${encodeURIComponent(visit.courseId)}`)
          }
        >
          {visit.courseTitle}
        </button>
      ))}
    </section>
  );
}
