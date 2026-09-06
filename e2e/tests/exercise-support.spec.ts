import { test, expect } from '@playwright/test';
import { patchHtmlForIframe } from '../../lib/utils/iframe';
import en from '../../lib/i18n/locales/en-US.json';

test('solution help repairs embedded JSON, preserves edits, and does not run code', async ({
  page,
}) => {
  const config = {
    type: 'code',
    hints: ['Inspect the missing handler.'],
    solution: 'return `</script><p>Reference</p>`;',
  };
  const html = `<html><body><textarea id="code-input">my unfinished attempt</textarea>
    <script id="widget-config" type="application/json">${JSON.stringify(config)}</script>
    <script>JSON.parse(document.getElementById('widget-config').textContent);</script>
    </body></html>`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setContent('<iframe sandbox="allow-scripts"></iframe>');
  await page.locator('iframe').evaluate(
    (frame, src) => {
      (frame as HTMLIFrameElement).srcdoc = src;
    },
    patchHtmlForIframe(html, en.exerciseSupport),
  );
  const frame = page.frameLocator('iframe');
  const help = frame.locator('#maic-exercise-support');
  await help.getByRole('button', { name: 'Hint (0/1)' }).click();
  await expect(help.getByText(config.hints[0])).toBeVisible();
  await help.getByRole('button', { name: 'Show solution', exact: true }).click();
  await expect(help.locator('pre')).toHaveText(config.solution);
  await help.getByRole('button', { name: 'Apply solution', exact: true }).click();
  await expect(frame.locator('#code-input')).toHaveValue(config.solution);
  await expect(help.getByRole('button', { name: 'Apply solution', exact: true })).toBeDisabled();
  await help.getByRole('button', { name: 'Restore my attempt', exact: true }).click();
  await expect(frame.locator('#code-input')).toHaveValue('my unfinished attempt');
  expect(errors).toEqual([]);
});

test('an exercise without a reference solution offers hints without a fake solution action', async ({
  page,
}) => {
  await page.setContent('<iframe sandbox="allow-scripts"></iframe>');
  await page.locator('iframe').evaluate(
    (frame, src) => {
      (frame as HTMLIFrameElement).srcdoc = src;
    },
    patchHtmlForIframe(
      '<script type="application/json" id="widget-config">{"type":"code","hints":["Try again"]}</script>',
      en.exerciseSupport,
    ),
  );
  const help = page.frameLocator('iframe').locator('#maic-exercise-support');
  await expect(help.getByRole('status')).toHaveText(en.exerciseSupport.missing);
  await expect(help.getByRole('button', { name: 'Apply solution', exact: true })).toBeDisabled();
  await help.getByRole('button', { name: 'Hint (0/1)' }).click();
  await expect(help.getByText('Try again', { exact: true })).toBeVisible();
});
