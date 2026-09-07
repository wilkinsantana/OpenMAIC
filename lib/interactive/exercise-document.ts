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
  // Original HTML remains the live lesson, including its custom controls and styles.
  // Retain compatibility with courses already generated as structured exercise data.
  const document = patchHtmlForIframe(config ? renderCodeExerciseHtml(config) : repaired, labels);
  if (config) return document;
  const sizing =
    '<style data-maic-viewport-sizing>html,body{width:100%!important;max-width:none!important;min-height:100%!important}body>main,body>.container,body>.app-container{width:100%!important;max-width:none!important;box-sizing:border-box}</style>';
  return document.replace(/<\/head\s*>/i, sizing + '</head>');
}
