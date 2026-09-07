import { describe, it, expect } from 'vitest';
import { parseCodeExercise, renderCodeExerciseHtml } from '../src/code-exercise.js';
import { generateWidgetContent } from '../src/scene-generator.js';
import { widgetOutline } from './scene-fixtures.js';
const exercise = {
  type: 'code',
  exerciseVersion: 1,
  title: 'Squares',
  description: 'Implement square(x).',
  language: 'javascript',
  starterCode: 'function square(x){return x}',
  solution: 'function square(x){return x*x}',
  hints: ['Multiply'],
  testCases: [{ id: 'a', description: 'Positive input', code: 'assert(square(3)===9)' }],
};
describe('structured exercises', () => {
  it('rejects incomplete contracts and duplicate test ids', () => {
    expect(parseCodeExercise({ ...exercise, description: '' })).toBeNull();
    expect(
      parseCodeExercise({ ...exercise, testCases: [exercise.testCases[0], exercise.testCases[0]] }),
    ).toBeNull();
    expect(parseCodeExercise({ ...exercise, language: 'ruby' })).toBeNull();
    expect(parseCodeExercise({ ...exercise, exerciseVersion: 2 })).toBeNull();
  });
  it('drops layout fields and escapes embedded script endings', () => {
    const config = parseCodeExercise({
      ...exercise,
      title: '</script><script>bad()</script>',
      css: 'body{display:none}',
      html: 'untrusted layout',
    });
    expect(config).not.toHaveProperty('css');
    expect(config).not.toHaveProperty('html');
    const html = renderCodeExerciseHtml(config!);
    expect(html).not.toContain('<script>bad()');
    expect(html).toContain('data-maic-exercise-shell="1"');
  });
  it('generates a fixed shell from data and rejects the old arbitrary HTML response', async () => {
    const outline = {
      ...widgetOutline(),
      widgetType: 'code' as const,
      widgetOutline: { language: 'javascript' as const },
    };
    const result = await generateWidgetContent(outline, async () => JSON.stringify(exercise));
    expect(result?.widgetConfig?.exerciseVersion).toBe(1);
    expect(result?.html).toContain('data-maic-exercise-shell');
    expect(
      await generateWidgetContent(
        outline,
        async () => '<html><body>Unstructured playground</body></html>',
      ),
    ).toBeNull();
  });
});
