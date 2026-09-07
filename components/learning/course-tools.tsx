'use client';
import { useRef, useState } from 'react';
import { useStageStore, flushStageSave } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import { getTTSVoices } from '@/lib/audio/constants';
import { useTTSPreview } from '@/lib/audio/use-tts-preview';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { pickNarratorAgent } from '@/lib/audio/agent-voice';
import { generateAndStoreTTS, useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { planCourseModule } from '@/lib/learning/course-module';
import { useI18n } from '@/lib/hooks/use-i18n';

export function CourseTools() {
  const { t } = useI18n();
  const stage = useStageStore((s) => s.stage);
  const generationStatus = useStageStore((s) => s.generationStatus);
  const settings = useSettingsStore();
  const teacher = stage?.generatedAgentConfigs?.find((a) => a.role === 'teacher');
  const [voice, setVoice] = useState(
    teacher?.voiceConfig?.providerId === 'lemonade-tts' ? teacher.voiceConfig.voiceId : 'af_heart',
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const expanding = useRef(false);
  const preview = useTTSPreview();
  const [level, setLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [topics, setTopics] = useState('');
  const [resources, setResources] = useState('');
  const generator = useSceneGenerator();
  if (!stage) return null;
  const provider = settings.ttsProvidersConfig['lemonade-tts'];
  const voices = getTTSVoices('lemonade-tts');
  const button = 'rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50';
  async function saveVoice() {
    const state = useStageStore.getState();
    if (state.stage?.id !== stage!.id) throw new Error('Course changed');
    let roster = state.stage.generatedAgentConfigs ?? [];
    if (!roster.some((a) => a.role === 'teacher')) {
      const narrator = pickNarratorAgent(useAgentRegistry.getState().listAgents());
      if (!narrator) throw new Error('No course teacher available');
      roster = [
        ...roster,
        {
          id: narrator.id,
          name: narrator.name,
          role: 'teacher',
          persona: narrator.persona,
          avatar: narrator.avatar ?? '',
          color: narrator.color ?? '#8b5cf6',
          priority: narrator.priority ?? 0,
        },
      ];
    }
    state.setStageAgents(
      roster.map((a) =>
        a.role === 'teacher'
          ? { ...a, voiceConfig: { providerId: 'lemonade-tts', voiceId: voice } }
          : a,
      ),
    );
    await flushStageSave();
  }
  async function regenerate() {
    if (busy) return;
    setBusy(true);
    abort.current = new AbortController();
    let done = 0,
      failed = 0;
    const targetStage = stage!.id;
    try {
      await saveVoice();
      const queue = useStageStore
        .getState()
        .scenes.flatMap((scene) =>
          (scene.actions ?? [])
            .filter((a) => a.type === 'speech')
            .map((action) => ({ sceneId: scene.id, action })),
        );
      for (const { sceneId, action } of queue) {
        if (abort.current.signal.aborted || useStageStore.getState().stage?.id !== targetStage)
          break;
        if (action.type !== 'speech' || !action.id || !action.text.trim()) continue;
        try {
          const id = await generateAndStoreTTS(
            `course_voice_${action.id}`,
            action.text,
            stage!.languageDirective,
            abort.current.signal,
            undefined,
            undefined,
            targetStage,
            { providerId: 'lemonade-tts', voiceId: voice },
          );
          const state = useStageStore.getState();
          if (state.stage?.id !== targetStage) break;
          const scene = state.scenes.find((s) => s.id === sceneId);
          if (id && scene) {
            state.updateScene(sceneId, {
              actions: (scene.actions ?? []).map((a) =>
                a.type === 'speech' && a.id === action.id && a.text === action.text
                  ? { ...a, audioId: id, audioInvalidated: false }
                  : a,
              ),
            });
            await flushStageSave();
            done++;
          } else failed++;
        } catch {
          if (abort.current.signal.aborted) break;
          failed++;
        }
        setMessage(t('courseTools.voicing', { done, total: queue.length, failed }));
      }
      setMessage(t('courseTools.voiceFinished', { done, failed }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('courseTools.failed'));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  async function expand() {
    if (generationStatus === 'generating' || busy || expanding.current) return;
    const state = useStageStore.getState();
    if (!state.stage) return;
    const materialized = new Set(state.scenes.map((scene) => scene.order));
    if (
      !state.generationComplete &&
      state.outlines.some((outline) => !materialized.has(outline.order))
    ) {
      setMessage(t('courseTools.finishPending'));
      return;
    }
    expanding.current = true;
    try {
      const batch = planCourseModule({
        level,
        topics,
        resources,
        context: `${state.stage.name}: ${state.scenes.map((s) => s.title).join('; ')}`,
        existingOrders: [
          ...state.scenes.map((s) => s.order),
          ...state.outlines.map((o) => o.order),
        ],
      });
      state.setGenerationStatus('generating');
      state.setOutlines([
        ...state.outlines.filter((outline) => materialized.has(outline.order)),
        ...batch,
      ]);
      state.setGenerationComplete(false);
      await flushStageSave();
      setMessage(t('courseTools.generating', { count: batch.length }));
      setTopics('');
      await generator.generateRemaining({
        outlineIds: batch.map((o) => o.id),
        stageInfo: {
          name: state.stage.name,
          description: state.stage.description,
          style: state.stage.style,
        },
        languageDirective: state.stage.languageDirective,
      });
      await flushStageSave();
      setMessage(t('courseTools.generationFinished'));
    } catch (error) {
      useStageStore.getState().setGenerationStatus('error');
      setMessage(error instanceof Error ? error.message : t('courseTools.failed'));
    } finally {
      expanding.current = false;
    }
  }
  return (
    <section className="space-y-3 border-t pt-4">
      <details>
        <summary className="cursor-pointer font-medium">{t('courseTools.voice')}</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">{t('courseTools.voiceNotice')}</p>
          <label className="block text-sm">
            {t('courseTools.kokoro')}
            <select
              aria-label={t('courseTools.kokoro')}
              className="mt-1 block w-full rounded border bg-background p-2"
              value={voice}
              disabled={busy}
              onChange={(e) => setVoice(e.target.value)}
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.language})
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className={button}
              disabled={busy}
              onClick={() => {
                void (
                  preview.previewing
                    ? Promise.resolve(preview.stopPreview())
                    : preview.startPreview({
                        text: t('settings.ttsTestTextDefault'),
                        providerId: 'lemonade-tts',
                        modelId: provider?.modelId || 'kokoro-v1',
                        voice,
                        speed: settings.ttsSpeed,
                        apiKey: provider?.apiKey,
                        baseUrl: provider?.baseUrl || provider?.customDefaultBaseUrl,
                      })
                ).catch((e) => setMessage(String(e)));
              }}
            >
              {t(preview.previewing ? 'courseTools.stopPreview' : 'courseTools.preview')}
            </button>
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                void saveVoice()
                  .then(() => setMessage(t('courseTools.voiceSaved')))
                  .catch((e) => setMessage(String(e)))
              }
            >
              {t('courseTools.saveVoice')}
            </button>
            <button
              className={button}
              disabled={busy || !settings.ttsEnabled || generationStatus === 'generating'}
              onClick={() => void regenerate()}
            >
              {t('courseTools.regenerate')}
            </button>
            {busy && (
              <button className={button} onClick={() => abort.current?.abort()}>
                {t('courseTools.stop')}
              </button>
            )}
          </div>
        </div>
      </details>
      <details>
        <summary className="cursor-pointer font-medium">{t('courseTools.expand')}</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">{t('courseTools.expandNotice')}</p>
          <select
            aria-label={t('courseTools.level')}
            className="rounded border bg-background p-2"
            value={level}
            onChange={(e) => setLevel(e.target.value as typeof level)}
          >
            {(['Beginner', 'Intermediate', 'Advanced'] as const).map((v) => (
              <option key={v} value={v}>
                {t(`courseTools.${v.toLowerCase()}`)}
              </option>
            ))}
          </select>
          <label className="block text-sm">
            {t('courseTools.topics')}
            <textarea
              className="mt-1 min-h-28 w-full rounded border bg-background p-2"
              value={topics}
              maxLength={9300}
              onChange={(e) => setTopics(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            {t('courseTools.resources')}
            <textarea
              className="mt-1 w-full rounded border bg-background p-2"
              value={resources}
              maxLength={6000}
              onChange={(e) => setResources(e.target.value)}
            />
          </label>
          <button
            className={button}
            disabled={!topics.trim() || busy || generationStatus === 'generating'}
            onClick={() => void expand()}
          >
            {t('courseTools.addModule')}
          </button>
          {generationStatus === 'generating' && (
            <button className={button} onClick={() => generator.stop()}>
              {t('courseTools.pause')}
            </button>
          )}
        </div>
      </details>
      {message && (
        <p className="text-xs" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
