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
  await expect(page.frameLocator('iframe').getByRole('status')).toHaveText(
    en.exerciseSupport.missing,
  );
  await expect(help.getByRole('button', { name: 'Apply solution', exact: true })).toBeDisabled();
  await help.getByRole('button', { name: 'Hint (0/1)' }).click();
  await expect(help.getByText('Try again', { exact: true })).toBeVisible();
});

test('extends the authored toolbar without duplicating hints or reveal controls', async ({
  page,
}) => {
  const html = `<html><body><header><div class="actions">
    <button id="hint-btn" class="secondary" onclick="document.getElementById('hint').hidden=false">Need a Hint? (0/1)</button>
    <button id="solution-toggle-btn" class="secondary" onclick="document.getElementById('solution').hidden=false">Reveal Solution</button>
    <button id="run-btn" onclick="document.getElementById('result').textContent='Ran'">Run & Verify</button>
    </div></header><p id="hint" hidden>Authored hint</p><div id="solution" hidden><pre>reference code</pre></div>
    <p id="result"></p><textarea id="code-input">my attempt</textarea>
    <script type="application/json" id="widget-config">{"type":"code","hints":["Authored hint"],"solution":"reference code"}</script></body></html>`;
  await page.setContent('<iframe sandbox="allow-scripts"></iframe>');
  await page.locator('iframe').evaluate(
    (frame, src) => {
      (frame as HTMLIFrameElement).srcdoc = src;
    },
    patchHtmlForIframe(html, en.exerciseSupport),
  );
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('[data-maic-action-bar]').getByRole('button')).toHaveCount(6);
  await expect(frame.locator('#maic-exercise-support')).toBeHidden();
  await frame.getByRole('button', { name: /Need a Hint/ }).click();
  await expect(frame.locator('#hint')).toBeVisible();
  await frame.getByRole('button', { name: 'Reveal Solution', exact: true }).click();
  await expect(frame.locator('#solution')).toBeVisible();
  const apply = frame
    .locator('.actions')
    .getByRole('button', { name: 'Apply solution', exact: true });
  await expect(apply).toHaveClass('secondary');
  await expect(frame.locator('.actions > button')).toHaveText([
    'Need a Hint? (0/1)',
    'Hide hints',
    'Reveal Solution',
    'Apply solution',
    'Restore my attempt',
    'Run & Verify',
  ]);
  await expect(apply).toHaveCSS('min-height', '40px');
  await expect(frame.locator('#run-btn')).toHaveCSS('background-color', 'rgb(139, 92, 246)');
  await apply.click();
  await expect(frame.locator('#code-input')).toHaveValue('reference code');
  await expect(frame.locator('#result')).toBeEmpty();
  await frame.getByRole('button', { name: 'Restore my attempt', exact: true }).click();
  await expect(frame.locator('#code-input')).toHaveValue('my attempt');
  await frame.getByRole('button', { name: 'Run & Verify', exact: true }).click();
  await expect(frame.locator('#result')).toHaveText('Ran');
});

test('console card fills spare column height while long output scrolls', async ({ page }) => {
  const html = `<html><head><style>.workspace{display:flex;flex-direction:column;height:700px;gap:12px;overflow:auto}.panel-box{padding:14px}#output{max-height:120px;overflow:auto;white-space:pre-wrap}</style></head><body>
    <section class="workspace"><div style="height:200px">Simulator and tests</div><div class="panel-box"><h3>Console Output</h3><div id="output">Ready</div></div><div id="hint" style="display:none;height:80px">Hint</div></section>
    <script type="application/json" id="widget-config">{"type":"code"}</script></body></html>`;
  await page.setContent(
    '<iframe sandbox="allow-scripts" style="height:850px;width:900px"></iframe>',
  );
  await page.locator('iframe').evaluate(
    (frame, src) => {
      (frame as HTMLIFrameElement).srcdoc = src;
    },
    patchHtmlForIframe(html, en.exerciseSupport),
  );
  const frame = page.frameLocator('iframe');
  const output = frame.locator('#output');
  const before = await output.evaluate((el) => el.getBoundingClientRect().height);
  expect(before).toBeGreaterThan(300);
  await output.evaluate((el) => {
    el.textContent = 'A long log line\n'.repeat(200);
  });
  expect(await output.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await output.evaluate((el) => el.getBoundingClientRect().height)).toBeCloseTo(before, 0);
  await frame.locator('#hint').evaluate((el) => {
    el.style.display = 'block';
  });
  expect(await output.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(before);
});

test('bottom actions move to the top, hints toggle on the right, and notices dismiss', async ({
  page,
}) => {
  await page.clock.install();
  const html = `<html><body><div class="header"><h1>Exercise</h1><div class="controls"><button id="run-btn">Run</button></div></div>
  <div class="workspace"><div class="panel"><textarea id="editor-textarea">attempt</textarea></div><div class="panel">Tests</div></div>
  <div class="drawer-section"><div class="drawer-header"><div><button id="hint-toggle-btn" onclick="document.getElementById('hint-0').style.display='block'">Reveal Hint (0/1)</button><button onclick="document.getElementById('solution').style.display='block'">Reveal Solution</button></div><span>Use hints if you're stuck!</span></div>
  <div class="hints-list"><div class="hint-item" id="hint-0" style="display:none">Inspect the handler</div></div><pre id="solution" style="display:none">answer</pre></div>
  <script id="widget-config" type="application/json">{"type":"code","hints":["Inspect the handler"]}</script></body></html>`;
  await page.setContent(
    '<iframe sandbox="allow-scripts" style="width:1200px;height:800px"></iframe>',
  );
  await page.locator('iframe').evaluate(
    (frame, src) => {
      (frame as HTMLIFrameElement).srcdoc = src;
    },
    patchHtmlForIframe(html, en.exerciseSupport),
  );
  const frame = page.frameLocator('iframe');
  const top = frame.locator('[data-maic-exercise-toolbar]');
  await expect(top.getByRole('button', { name: /Reveal Hint/ })).toHaveCount(1);
  await expect(frame.locator('.drawer-section')).toBeHidden();
  await expect(top.getByRole('button', { name: /Reveal Hint/ })).toHaveAttribute(
    'title',
    "Use hints if you're stuck!",
  );
  await top.getByRole('button', { name: /Reveal Hint/ }).click();
  await expect(frame.locator('.workspace > .panel:last-child #hint-0')).toBeVisible();
  await top.getByRole('button', { name: 'Hide hints', exact: true }).click();
  await expect(frame.locator('#hint-0')).toBeHidden();
  await top.getByRole('button', { name: 'Show hints', exact: true }).click();
  await expect(frame.locator('#hint-0')).toBeVisible();
  await top.getByRole('button', { name: 'Reveal Solution', exact: true }).click();
  await expect(frame.locator('.workspace > .panel:last-child #solution')).toBeVisible();
  await top.getByRole('button', { name: 'Apply solution', exact: true }).click();
  await expect(frame.locator('#editor-textarea')).toHaveValue('answer');
  await frame.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
  await expect(frame.getByRole('status')).toBeHidden();
  await top.getByRole('button', { name: 'Restore my attempt', exact: true }).click();
  await expect(frame.getByRole('status')).toBeVisible();
  await page.clock.fastForward(5100);
  await expect(frame.getByRole('status')).toBeHidden();
});
