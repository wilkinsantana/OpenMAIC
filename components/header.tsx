'use client';

import { useStageStore } from '@/lib/store';
import { isCodeExercise } from '@/lib/interactive/exercise-support';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useRouter, useSearchParams } from 'next/navigation';
import type { StageMode } from '@/lib/types/stage';
import { classroomExitLabelKey, exitClassroom } from '@/lib/workbench/classroom-exit';
import { HeaderControls } from './stage/header-controls';

interface HeaderProps {
  readonly onNavigateScene?: (id: string) => unknown;
  readonly currentSceneTitle: string;
  readonly mode?: StageMode;
  readonly proModeActive?: boolean;
  readonly canEdit?: boolean;
  readonly onToggleEditMode?: () => void;
  /** Replaces the default back-to-home arrow as the header's leftmost
      control. `PlaybackChromeRoot` passes the workbench's return control
      here while a session is attached and full-screen playback is on, so the
      top-left back affordance becomes the back-to-workspace control instead of a home arrow
      (which would navigate away from the hosted classroom entirely). */
  readonly backControl?: ReactNode;
  /** Drops the back slot entirely (no `backControl`, no home arrow). The
      embedded workbench form uses this: the conversation sits beside/above
      the classroom, so any back affordance here would duplicate the chat's
      own back and could exit the workbench. */
  readonly hideBackControl?: boolean;
  /** Hide application-global controls in a workbench-attached classroom. */
  readonly hideGlobalControls?: boolean;
  /** Hide course-level share/export in a workbench-attached classroom. */
  readonly hideCourseActions?: boolean;
}

export function Header({
  onNavigateScene,
  currentSceneTitle,
  mode,
  proModeActive,
  canEdit,
  onToggleEditMode,
  backControl,
  hideBackControl,
  hideGlobalControls,
  hideCourseActions,
}: HeaderProps) {
  const { t } = useI18n();
  const sceneIndex = useStageStore((s) =>
    s.scenes.findIndex((scene) => scene.id === s.currentSceneId),
  );
  const scene = useStageStore((s) => s.scenes.find((scene) => scene.id === s.currentSceneId));
  const hasExerciseNumber =
    scene?.content.type === 'interactive' &&
    (scene.content.widgetType === 'code' || isCodeExercise(scene.content.html ?? ''));
  const router = useRouter();
  const searchParams = useSearchParams();
  const exitLabel = t(classroomExitLabelKey(searchParams));

  return (
    <>
      <header className="min-h-20 shrink-0 px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between z-10 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-slate-700/70 gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {hideBackControl
            ? null
            : (backControl ?? (
                <button
                  onClick={() => exitClassroom(router, searchParams)}
                  className="shrink-0 p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  title={exitLabel}
                  aria-label={exitLabel}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ))}
          {/* Title block — hidden when `mode === 'edit'`. Header lives
              inside `PlaybackChromeRoot`, which is unmounted by `Stage`
              once mode flips to 'edit', so in steady state this branch
              is always taken. The guard exists for the ~280ms
              AnimatePresence exit window where the playback chrome
              is still rendering its exit animation while `mode` has
              already flipped — without the guard, this title would
              briefly stack on top of the incoming EditChromeRoot's
              CommandBar title during the cross-fade. */}
          {mode !== 'edit' && (
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-gray-500 mb-0.5">
                {t('stage.currentScene')}
                {!hasExerciseNumber && sceneIndex >= 0 && (
                  <span data-maic-page-number className="ml-2 tabular-nums">
                    {String(sceneIndex + 1).padStart(2, '0')}
                  </span>
                )}
              </span>
              <h1
                className="text-xl font-bold text-gray-800 dark:text-gray-200 tracking-tight truncate"
                suppressHydrationWarning
              >
                {currentSceneTitle || t('common.loading')}
              </h1>
            </div>
          )}
        </div>

        {/* Standalone classroom keeps the full cluster. Workbench-attached
            classrooms omit both the global capsule and course share/export. */}
        <HeaderControls
          onNavigateScene={onNavigateScene}
          mode={mode}
          proModeActive={proModeActive}
          canEdit={canEdit}
          onToggleEditMode={onToggleEditMode}
          showGlobalControls={!hideGlobalControls}
          showCourseActions={!hideCourseActions}
        />
      </header>
    </>
  );
}
