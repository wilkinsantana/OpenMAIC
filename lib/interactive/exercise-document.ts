import { parseCodeExercise, renderCodeExerciseHtml } from '@openmaic/generation/code-exercise';
import {
  isCodeExercise,
  repairWidgetConfigJson,
  type ExerciseSupportLabels,
} from './exercise-support';
import { patchHtmlForIframe } from '@/lib/utils/iframe';

/** Rendering adapter only: never mutates the stored lesson or its source hash. */
export function buildExerciseDocument(
  html: string,
  labels: ExerciseSupportLabels,
  forceCode = false,
): string {
  if (!forceCode && !isCodeExercise(html)) return patchHtmlForIframe(html, labels);
  const repaired = repairWidgetConfigJson(html);
  const match = /<script\b(?=[^>]*\bid=["']widget-config["'])[^>]*>([\s\S]*?)<\/script\s*>/i.exec(
    repaired,
  );
  let data: unknown;
  try {
    data = match ? JSON.parse(match[1]) : undefined;
  } catch {
    /* Legacy runner reads its own config. */
  }
  const config = parseCodeExercise(data);
  const document = config
    ? renderCodeExerciseHtml(config)
    : renderCodeExerciseHtml(
        { type: 'code', title: labels.sceneTitle },
        patchHtmlForIframe(repaired),
      );
  return patchHtmlForIframe(document, labels);
}
