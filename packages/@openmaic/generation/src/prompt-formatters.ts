/**
 * Prompt and context building utilities for the generation pipeline.
 */

import type { PdfImage } from './outline-types.js';
import type { AgentInfo, SceneGenerationContext } from './pipeline-types.js';

/** Build a course context string for injection into action prompts */
export function buildCourseContext(ctx?: SceneGenerationContext): string {
  if (!ctx) return '';

  const lines: string[] = [];

  // Course outline with position marker
  lines.push('Course Outline:');
  ctx.allTitles.forEach((t, i) => {
    const marker = i === ctx.pageIndex - 1 ? ' ← current' : '';
    lines.push(`  ${i + 1}. ${t}${marker}`);
  });

  // Position information
  lines.push('');
  lines.push(
    'IMPORTANT: All pages belong to the SAME class session. Do NOT greet again after the first page. Refer back only when it helps explain a specific connection. NEVER say "last class" or "previous session" because there is no previous session.',
  );
  lines.push('');
  if (ctx.pageIndex === 1) {
    lines.push('Position: This is the FIRST page. Open with a greeting and course introduction.');
  } else if (ctx.pageIndex === ctx.totalPages) {
    lines.push('Position: This is the LAST page. Conclude the course with a summary and closing.');
    lines.push(
      'Continuity: Keep the lesson coherent, but do not open with a recap or a transition formula. Do NOT greet or re-introduce.',
    );
  } else {
    lines.push(`Position: Page ${ctx.pageIndex} of ${ctx.totalPages} (middle of the course).`);
    lines.push(
      'Continuity: Keep the lesson coherent, but do not open with a recap or a transition formula. Do NOT greet or re-introduce.',
    );
  }

  lines.push('');
  lines.push(
    'Natural spoken delivery: Start with the current idea, a concrete observation, a relevant question, an example, or a short task. Choose what fits the content; do not rotate through a fixed template. Avoid stock openings such as "Now that we...", "Now that you...", "Having covered...", or "Building on what we...". Do not repeat the preceding page\'s opening wording or sentence pattern. A backward reference is optional and belongs only where the explanation needs it. Vary sentence length and rhythm while keeping the teacher\'s personality and the requested language. Do not imply the learner has mastered or completed an exercise merely because the page changed.',
  );

  // Show both ends: continuity without copying the previous opening.
  if (ctx.previousSpeeches.length > 0) {
    lines.push('');
    lines.push(
      'Previous page opening (context only; do not imitate its wording or sentence pattern):',
    );
    lines.push(`  ${JSON.stringify(ctx.previousSpeeches[0].slice(0, 250))}`);
    lines.push('Previous page ending (context only; no recap required):');
    const lastSpeech = ctx.previousSpeeches[ctx.previousSpeeches.length - 1];
    lines.push(`  "...${lastSpeech.slice(-150)}"`);
  }

  return lines.join('\n');
}

/** Format agent list for injection into action prompts */
export function formatAgentsForPrompt(agents?: AgentInfo[]): string {
  if (!agents || agents.length === 0) return '';

  const lines = ['Classroom Agents:'];
  for (const a of agents) {
    const personaPart = a.persona ? ` — ${a.persona}` : '';
    lines.push(`- id: "${a.id}", name: "${a.name}", role: ${a.role}${personaPart}`);
  }
  return lines.join('\n');
}

/** Extract the teacher agent's persona for injection into outline/content prompts */
export function formatTeacherPersonaForPrompt(agents?: AgentInfo[]): string {
  if (!agents || agents.length === 0) return '';

  const teacher = agents.find((a) => a.role === 'teacher');
  if (!teacher?.persona) return '';

  return `Teacher Persona:\nName: ${teacher.name}\n${teacher.persona}\n\nAdapt the content style and tone to match this teacher's personality. IMPORTANT: The teacher's name and identity must NOT appear on the slides — no "Teacher ${teacher.name}'s tips", no "Teacher's message", etc. Slides should read as neutral, professional visual aids.`;
}

/**
 * Format a single PdfImage description for prompt inclusion.
 * Includes dimension/aspect-ratio info when available.
 */
export function formatImageDescription(img: PdfImage): string {
  let dimInfo = '';
  if (img.width && img.height) {
    const ratio = (img.width / img.height).toFixed(2);
    dimInfo = ` | size: ${img.width}×${img.height} (aspect ratio ${ratio})`;
  }
  const sourceInfo = img.sourceDocumentName ? ` from ${img.sourceDocumentName}` : ' from PDF';
  const desc = img.description ? ` | ${img.description}` : '';
  return `- **${img.id}**:${sourceInfo} page ${img.pageNumber}${dimInfo}${desc}`;
}

/**
 * Format a short image placeholder for vision mode.
 * Only ID + page + dimensions + aspect ratio (no description), since the model can see the actual image.
 */
export function formatImagePlaceholder(img: PdfImage): string {
  let dimInfo = '';
  if (img.width && img.height) {
    const ratio = (img.width / img.height).toFixed(2);
    dimInfo = ` | size: ${img.width}×${img.height} (aspect ratio ${ratio})`;
  }
  const sourceInfo = img.sourceDocumentName ? ` from ${img.sourceDocumentName}` : ' from PDF';
  return `- **${img.id}**: image${sourceInfo} page ${img.pageNumber}${dimInfo} [see attached]`;
}

/**
 * Build a multimodal user content array for the AI SDK.
 * Interleaves text and images so the model can associate img_id with actual image.
 * Each image label includes dimensions when available so the model knows the size
 * before seeing the image (important for layout decisions).
 */
export function buildVisionUserContent(
  userPrompt: string,
  images: Array<{ id: string; src: string; width?: number; height?: number }>,
): Array<{ type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }> {
  const parts: Array<
    { type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }
  > = [{ type: 'text', text: userPrompt }];
  if (images.length > 0) {
    parts.push({ type: 'text', text: '\n\n--- Attached Images ---' });
    for (const img of images) {
      let dimInfo = '';
      if (img.width && img.height) {
        const ratio = (img.width / img.height).toFixed(2);
        dimInfo = ` (${img.width}×${img.height}, aspect ratio ${ratio})`;
      }
      parts.push({ type: 'text', text: `\n**${img.id}**${dimInfo}:` });
      // Strip data URI prefix — AI SDK only accepts http(s) URLs or raw base64
      const dataUriMatch = img.src.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUriMatch) {
        parts.push({
          type: 'image',
          image: dataUriMatch[2],
          mimeType: dataUriMatch[1],
        });
      } else {
        parts.push({ type: 'image', image: img.src });
      }
    }
  }
  return parts;
}

/**
 * Build language instruction text from course-level directive and optional per-scene note.
 * Used by scene content and action generators to inject into prompt templates.
 */
export function buildLanguageText(directive?: string, sceneNote?: string): string {
  if (!directive && !sceneNote) return '';
  let text = directive || '';
  if (sceneNote) {
    text += (text ? '\n\n' : '') + `Additional language note for this scene: ${sceneNote}`;
  }
  return text;
}
