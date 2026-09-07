import { buildExerciseDocument } from '../../lib/interactive/exercise-document';
import { renderCodeExerciseHtml } from '@openmaic/generation/code-exercise';
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
  await expect(help.getByRole('button', { name: 'Show solution', exact: true })).toHaveCount(0);
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
  await expect(frame.locator('[data-maic-action-bar]').getByRole('button')).toHaveCount(5);
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

test('bottom actions move to the top while authored help stays in its drawer', async ({ page }) => {
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
  await expect(top.getByRole('button', { name: /Reveal Hint/ })).toHaveAttribute(
    'title',
    "Use hints if you're stuck!",
  );
  await top.getByRole('button', { name: /Reveal Hint/ }).click();
  await expect(frame.locator('.drawer-section #hint-0')).toBeVisible();
  await expect(frame.locator('#hint-0')).toBeVisible();
  await top.getByRole('button', { name: 'Reveal Solution', exact: true }).click();
  await expect(frame.locator('.drawer-section #solution')).toBeVisible();
  await top.getByRole('button', { name: 'Apply solution', exact: true }).click();
  await expect(frame.locator('#editor-textarea')).toHaveValue('answer');
  await frame.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
  await expect(frame.getByRole('status')).toBeHidden();
  await top.getByRole('button', { name: 'Restore my attempt', exact: true }).click();
  await expect(frame.getByRole('status')).toBeVisible();
  await page.clock.fastForward(5100);
  await expect(frame.getByRole('status')).toBeHidden();
});

test('output shares spare height with tests without resizing their enclosing panel', async ({
  page,
}) => {
  await page.setContent(
    '<iframe sandbox="allow-scripts" style="width:900px;height:850px"></iframe>',
  );
  await page.locator('iframe').evaluate(
    (frame, src) => {
      (frame as HTMLIFrameElement).srcdoc = src;
    },
    patchHtmlForIframe(
      `<html><body><div class="panel" style="height:700px;display:flex;flex-direction:column;overflow:hidden"><div style="height:300px;flex-shrink:0">Test results</div><div style="height:40px;flex-shrink:0">Execution Output</div><div id="output" style="max-height:200px;overflow:auto;white-space:pre-wrap">Ready</div></div><script type="application/json" id="widget-config">{"type":"code"}</script></body></html>`,
      en.exerciseSupport,
    ),
  );
  const frame = page.frameLocator('iframe');
  const panel = frame.locator('.panel');
  const output = frame.locator('#output');
  await expect.poll(() => output.evaluate((el) => el.clientHeight)).toBe(360);
  await output.evaluate((el) => {
    el.textContent = 'Log line\n'.repeat(300);
  });
  expect(await panel.evaluate((el) => el.clientHeight)).toBe(700);
  expect(await output.evaluate((el) => el.clientHeight)).toBe(360);
  expect(await output.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});

test('legacy JavaScript-config exercises retain authored help within the original pane', async ({
  page,
}) => {
  await page.setContent(
    '<iframe sandbox="allow-scripts" style="width:1000px;height:800px"></iframe>',
  );
  await page.locator('iframe').evaluate(
    (frame, src) => {
      (frame as HTMLIFrameElement).srcdoc = src;
    },
    patchHtmlForIframe(
      `<html><body><header><h1>Legacy lesson</h1><div><button id="hint-btn" onclick="document.getElementById('hints-panel').style.display='block';document.getElementById('hints-container').innerHTML='<div class=hint-card>A useful hint</div>'">Hint</button><button id="solution-toggle-btn" onclick="document.getElementById('solution').style.display='block'">View Solution</button><button id="run-btn">Run Tests</button></div></header><div class="workspace"><div class="pane"><textarea id="code-input">starter</textarea></div><div class="pane"><div id="hints-panel" style="display:none"><div id="hints-container"></div></div><div id="solution" style="display:none"><pre>reference</pre></div></div></div><script>const WIDGET_CONFIG={hints:['A useful hint']};</script></body></html>`,
      en.exerciseSupport,
    ),
  );
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('[data-maic-action-bar]')).toBeVisible();
  await expect(frame.locator('header').first()).toBeVisible();
  await expect(frame.getByRole('button', { name: /^(Hide|Show) hints$/ })).toHaveCount(0);
  await frame.getByRole('button', { name: 'Hint', exact: true }).click();
  await expect(frame.locator('.workspace > .pane > #hints-panel')).toContainText('A useful hint');
  await frame.getByRole('button', { name: 'View Solution', exact: true }).click();
  await expect(frame.locator('.workspace > .pane > #solution')).toContainText('reference');
});

test('progressive hint control becomes the only solution control and plain hints can hide', async ({
  page,
}) => {
  await page.setContent(
    '<iframe sandbox="allow-scripts" style="width:1000px;height:800px"></iframe>',
  );
  await page.locator('iframe').evaluate(
    (frame, src) => {
      (frame as HTMLIFrameElement).srcdoc = src;
    },
    patchHtmlForIframe(
      `<html><body><header><h1>Mission</h1><div><button id="hint-btn" onclick="this.textContent='Show Solution';document.getElementById('hints-container').innerHTML='<div>Hint 1: Inspect the event listener.</div><div>Hint 2: Create the element.</div>'">Hint</button><button id="run-btn">Run</button></div></header><textarea id="code-input"></textarea><div id="hints-container"></div><script id="widget-config" type="application/json">{"type":"code","solution":"reference"}</script></body></html>`,
      en.exerciseSupport,
    ),
  );
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('button', { name: /^(Hide|Show) hints$/ })).toHaveCount(0);
  await frame.getByRole('button', { name: 'Hint', exact: true }).click();
  await expect(frame.getByRole('button', { name: /show solution/i })).toHaveCount(1);
  await expect(frame.locator('body > #hints-container')).toContainText(
    'Inspect the event listener',
  );
  expect(
    await frame
      .locator('[data-maic-action-bar]')
      .evaluate((el) => Boolean(el.nextElementSibling?.hasAttribute('data-maic-hints-area'))),
  ).toBe(true);
});

test('shared shell owns layout and runs structured code without executing a shown solution', async ({
  page,
}) => {
  const config = {
    type: 'code' as const,
    exerciseVersion: 1 as const,
    title: 'Squares',
    description: 'Return the square of the input.',
    language: 'javascript' as const,
    starterCode: 'function square(x){return x}',
    solution: 'function square(x){return x*x}',
    hints: ['Multiply the input by itself.'],
    testCases: [
      {
        id: 'positive',
        description: 'Positive input',
        code: 'assert(square(3)===9,"Expected nine")',
      },
    ],
  };
  await page.setContent(
    '<iframe sandbox="allow-scripts" style="width:1100px;height:800px"></iframe>',
  );
  await page.locator('iframe').evaluate(
    (frame, src) => {
      (frame as HTMLIFrameElement).srcdoc = src;
    },
    buildExerciseDocument(renderCodeExerciseHtml(config), en.exerciseSupport),
  );
  const frame = page.frameLocator('iframe').first();
  await expect(frame.locator('#description')).toHaveText(config.description);
  await frame.getByRole('button', { name: 'Run & Verify', exact: true }).click();
  await expect(frame.locator('.test[data-state="failed"]')).toHaveCount(1);
  await frame.getByRole('button', { name: 'Show solution', exact: true }).click();
  await expect(frame.locator('#code-input')).toHaveValue(config.starterCode);
  await frame.getByRole('button', { name: 'Apply solution', exact: true }).click();
  await frame.getByRole('button', { name: 'Run & Verify', exact: true }).click();
  await expect(frame.locator('.test[data-state="passed"]')).toHaveCount(1);
  await expect(frame.locator('[data-maic-action-bar]')).toHaveCount(1);
  await page.screenshot({ path: '/tmp/openmaic-shared-shell.png' });
});

async function mountStructured(
  page: import('@playwright/test').Page,
  overrides: Record<string, unknown> = {},
) {
  const config = {
    type: 'code',
    exerciseVersion: 1,
    title: 'Shared lesson',
    description: 'Implement the function and verify the result.',
    language: 'javascript',
    starterCode: 'function value(){return 4}',
    solution: 'function value(){return 4}',
    hints: ['Inspect the result.'],
    testCases: [{ id: 'value', description: 'Returns four', code: 'assert(value()===4)' }],
    ...overrides,
  };
  await page.goto('/');
  await page.setContent(
    '<iframe sandbox="allow-scripts" style="width:100%;height:850px;border:0"></iframe>',
  );
  await page.locator('iframe').evaluate(
    (el, html) => {
      (el as HTMLIFrameElement).srcdoc = html;
    },
    buildExerciseDocument(renderCodeExerciseHtml(config as never), en.exerciseSupport),
  );
  return page.frameLocator('iframe').first();
}

test('DOM exercises isolate fixture layout and retain a working preview after verification', async ({
  page,
}) => {
  const frame = await mountStructured(page, {
    fixtureHtml:
      '<style>body{max-width:200px}</style><button id="add">Add</button><p id="count">0</p>',
    starterCode:
      'function attach(){document.getElementById("add").onclick=()=>document.getElementById("count").textContent="1"}',
    solution:
      'function attach(){document.getElementById("add").onclick=()=>document.getElementById("count").textContent="1"}',
    previewCode: 'attach();',
    testCases: [
      {
        id: 'click',
        description: 'Click updates the count',
        code: 'attach();document.getElementById("add").click();assert(document.getElementById("count").textContent==="1")',
      },
    ],
  });
  await frame.getByRole('button', { name: 'Run & Verify', exact: true }).click();
  await expect(frame.locator('.test[data-state="passed"]')).toHaveCount(1);
  const preview = frame.frameLocator('#preview');
  await preview.getByRole('button', { name: 'Add' }).click();
  await expect(preview.locator('#count')).toHaveText('1');
  expect(
    await frame.locator('.workspace').evaluate((el) => el.getBoundingClientRect().width),
  ).toBeGreaterThan(800);
  await expect(frame.locator('.CodeMirror')).toBeVisible();
});

test('a runaway pure-code exercise can be stopped without losing the editor', async ({ page }) => {
  const frame = await mountStructured(page, { starterCode: 'while(true){}' });
  await frame.getByRole('button', { name: 'Run & Verify', exact: true }).click();
  await frame.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(frame.locator('#output')).toHaveText('Execution stopped.');
  await expect(frame.getByRole('button', { name: 'Run & Verify', exact: true })).toBeEnabled();
});

test('original lesson content and subject-specific controls survive action-bar integration', async ({
  page,
}) => {
  const original = `<html><head><style>body{max-width:400px;margin:auto}.sample{color:rgb(52,211,153);background:#080f1c}.badge{border-radius:8px;background:#164e63}</style></head><body><header><h1>Growing herbs</h1></header><main><p>Check the soil before watering.</p><pre class="sample"><code>&lt;div id="plant"&gt;Basil&lt;/div&gt;</code></pre><button class="badge" id="water" onclick="this.textContent='Watered'">Water plant</button><textarea id="code-input">return false</textarea><section id="old-action-card"><div data-maic-actions><button id="run-btn" onclick="document.querySelector('.test-card').textContent='Test 1 PASSED'">Run tests</button></div></section><div class="test-card">Test 1 IDLE</div></main><script id="widget-config" type="application/json">{"type":"code","hints":["Look at the soil"],"solution":"return true"}</script></body></html>`;
  await page.goto('/');
  await page.setContent(
    '<iframe sandbox="allow-scripts" style="width:100%;height:850px;border:0"></iframe>',
  );
  await page.locator('iframe').evaluate(
    (el, html) => {
      (el as HTMLIFrameElement).srcdoc = html;
    },
    buildExerciseDocument(original, en.exerciseSupport),
  );
  const frame = page.frameLocator('iframe').first();
  await expect(frame.locator('.sample code')).toHaveText('<div id="plant">Basil</div>');
  await expect(frame.locator('.sample')).toHaveCSS('color', 'rgb(52, 211, 153)');
  await frame.getByRole('button', { name: 'Water plant', exact: true }).click();
  await expect(frame.locator('#water')).toHaveText('Watered');
  await expect(frame.locator('[data-maic-action-bar] #run-btn')).toHaveCount(1);
  await expect(frame.locator('#old-action-card')).toBeHidden();
  await frame.locator('#run-btn').click();
  await expect(frame.locator('.test-card')).toHaveText('Test 1 PASSED');
  await expect(frame.locator('#legacy-frame, #lesson-context')).toHaveCount(0);
  expect(
    await frame.locator('body').evaluate((el) => el.getBoundingClientRect().width),
  ).toBeGreaterThan(1000);
  await page.setViewportSize({ width: 540, height: 950 });
  expect(await frame.locator('body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: '/tmp/openmaic-original-content.png' });
});

for (const language of ['typescript', 'python'])
  test(`structured ${language} executes in its isolated worker`, async ({ page }) => {
    test.setTimeout(120000);
    const source =
      language === 'python' ? 'def value():\n    return 4' : 'function value(): number {return 4}';
    const frame = await mountStructured(page, {
      language,
      starterCode: source,
      solution: source,
      testCases: [
        {
          id: 'value',
          description: 'Returns four',
          code: language === 'python' ? 'assert value() == 4' : 'assert(value()===4)',
        },
      ],
    });
    await frame.getByRole('button', { name: 'Run & Verify', exact: true }).click();
    await expect(frame.locator('.test[data-state="passed"]')).toHaveCount(1, { timeout: 100000 });
  });

test('authored hints and solution keep their original containers and usable height', async ({
  page,
}) => {
  const original = `<html><head><style>body{display:flex;flex-direction:column;height:600px}.workspace{flex:1;min-height:0}.native-help{padding:16px;background:rgb(30,41,59)}#hints-panel p{margin:0;line-height:24px}</style></head><body>
<header><button id="hint-btn" onclick="document.querySelector('#hints-panel').hidden=false">Hint</button><button id="solution-btn" onclick="document.querySelector('#solution').hidden=false">Show solution</button><button id="run-btn">Run</button></header>
<aside class="native-help"><div id="hints-panel" hidden><p>Keep this hint in its authored panel.</p><p>Second line of guidance.</p></div><pre id="solution" hidden>return true;</pre></aside>
<div class="workspace"><textarea id="code-input">my attempt</textarea></div>
<script id="widget-config" type="application/json">{"type":"code","hints":["A hint"],"solution":"return true;"}</script></body></html>`;
  await page.goto('/');
  await page.setContent(
    '<iframe sandbox="allow-scripts" style="width:100%;height:650px"></iframe>',
  );
  await page.locator('iframe').evaluate(
    (el, html) => {
      (el as HTMLIFrameElement).srcdoc = html;
    },
    buildExerciseDocument(original, en.exerciseSupport),
  );
  const frame = page.frameLocator('iframe');
  await frame.locator('#hint-btn').click();
  await expect(frame.locator('.native-help > #hints-panel')).toBeVisible();
  expect(
    await frame.locator('#hints-panel').evaluate((el) => el.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(48);
  await frame.locator('#solution-btn').click();
  await expect(frame.locator('.native-help > #solution')).toBeVisible();
  await expect(frame.locator('[data-maic-hints-area]')).toBeHidden();
  await expect(frame.getByRole('button', { name: 'Apply solution', exact: true })).toBeVisible();
});
