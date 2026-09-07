// These scripts execute only inside the exercise's opaque-origin sandbox.
const WORKER_RUNTIME = String.raw`
self.onmessage = async ({ data }) => {
  const { config, code } = data;
  let logs = [];
  const emit = (value) => {
    if (logs.length < 300) logs.push(String(value).slice(0, 4000));
  };
  console.log = (...args) =>
    emit(args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  console.error = console.log;
  console.warn = console.log;
  try {
    let source = code;
    if (config.language === 'typescript') {
      await import('https://cdn.jsdelivr.net/npm/@babel/standalone@7.28.5/babel.min.js');
      source = globalThis.Babel.transform(code, {
        presets: ['typescript'],
        filename: 'exercise.ts',
      }).code;
    }
    let py;
    if (config.language === 'python') {
      const { loadPyodide } =
        await import('https://cdn.jsdelivr.net/pyodide/v314.0.6/full/pyodide.mjs');
      py = await loadPyodide({ stdout: emit, stderr: emit });
      await py.loadPackagesFromImports(code);
    }
    for (const test of config.testCases) {
      let state = 'passed',
        message = '';
      try {
        if (py) {
          const globals = py.toPy({});
          try {
            await py.runPythonAsync(code + '\n' + test.code, { globals });
          } finally {
            globals.destroy();
          }
        } else
          await new (Object.getPrototypeOf(async function () {}).constructor)(
            'assert',
            source + '\n' + test.code,
          )((ok, message) => {
            if (!ok) throw Error(message || 'Assertion failed');
          });
      } catch (error) {
        state = 'failed';
        message = String(error.message || error);
      }
      self.postMessage({ kind: 'test', id: test.id, state, message });
    }
    self.postMessage({ kind: 'done', output: logs.join('\n') || 'Verification finished.' });
  } catch (error) {
    self.postMessage({ kind: 'error', output: String(error.message || error) });
  }
};
`;

const DOM_RUNTIME = String.raw`
window.addEventListener('message', async (event) => {
  if (event.source !== parent || event.data?.kind !== 'execute') return;
  const { config, code } = event.data;
  const logs = [];
  console.log = (...args) => {
    if (logs.length < 300) logs.push(args.map(String).join(' '));
  };
  console.error = console.log;
  console.warn = console.log;
  const send = (data) => parent.postMessage({ __maicRunner: true, ...data }, '*');
  try {
    let source = code;
    if (config.language === 'typescript') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@babel/standalone@7.28.5/babel.min.js';
        s.onload = resolve;
        s.onerror = () => reject(Error('TypeScript runtime could not load'));
        document.head.appendChild(s);
      });
      source = Babel.transform(code, { presets: ['typescript'], filename: 'exercise.ts' }).code;
    }
    const execute = async (extra) =>
      new (Object.getPrototypeOf(async function () {}).constructor)(
        'assert',
        source + '\n' + extra,
      )((ok, message) => {
        if (!ok) throw Error(message || 'Assertion failed');
      });
    // The preview fixture is lesson content inside this child sandbox, never shell HTML.
    for (const test of config.testCases) {
      document.body.innerHTML = config.fixtureHtml || '';
      try {
        await execute(test.code);
        send({ kind: 'test', id: test.id, state: 'passed', message: '' });
      } catch (error) {
        send({
          kind: 'test',
          id: test.id,
          state: 'failed',
          message: String(error.message || error),
        });
      }
    }
    document.body.innerHTML = config.fixtureHtml || '';
    if (config.previewCode) await execute(config.previewCode);
    send({ kind: 'done', output: logs.join('\n') || 'Verification finished.' });
  } catch (error) {
    send({ kind: 'error', output: String(error.message || error) });
  }
});
parent.postMessage({ __maicRunner: true, kind: 'ready' }, '*');
`;

const LEGACY_BRIDGE = String.raw`
(function () {
  const send = (data) => parent.postMessage({ __maicLegacy: true, ...data }, '*');
  function editor() {
    const cms = document.querySelectorAll('.CodeMirror');
    if (cms.length > 1) return null;
    const cm = cms[0];
    if (cm?.CodeMirror)
      return { read: () => cm.CodeMirror.getValue(), write: (v) => cm.CodeMirror.setValue(v) };
    const known = document.querySelectorAll('textarea#code-input,textarea#editor-textarea');
    const candidates = known.length ? known : document.querySelectorAll('textarea');
    const el = candidates.length === 1 ? candidates[0] : null;
    return el
      ? {
          read: () => el.value,
          write: (v) => {
            el.value = v;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          },
        }
      : null;
  }
  function snapshot() {
    const rows = Array.from(
      document.querySelectorAll('.test-card,.test-item,.test-case,.test-result'),
    )
      .slice(0, 40)
      .map((el, i) => ({
        id: String(i),
        description: el.textContent.trim().slice(0, 3000),
        state: /\b(failed|fail)\b/i.test(el.textContent)
          ? 'failed'
          : /\b(passed|pass)\b/i.test(el.textContent)
            ? 'passed'
            : 'idle',
      }));
    const output = document.querySelector('#output,#console-output,#output-log');
    send({ kind: 'results', rows, output: output?.textContent.slice(0, 100000) || '' });
  }
  function lessonContext() {
    const blocks = [];
    let size = 0;
    const excluded = /(?:^|[-_\s])(?:editor|codemirror|console|output|tests?|verification|assertions?|hints?|solution|controls|toolbar|actions)(?:$|[-_\s])/i;
    function visit(node) {
      if (blocks.length >= 60 || size >= 30000 || !node || node.nodeType !== 1) return;
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|BUTTON|SELECT|IFRAME|SVG)$/.test(node.tagName)) return;
      if (excluded.test(node.id + ' ' + (typeof node.className === 'string' ? node.className : ''))) return;
      if (node.hidden || getComputedStyle(node).display === 'none') return;
      const children = Array.from(node.children);
      const semantic = /^(P|LI|PRE|H[1-6]|BLOCKQUOTE)$/.test(node.tagName);
      const inlineOnly = children.every((child) => /^(SPAN|STRONG|B|EM|I|CODE|BR|A|SMALL)$/.test(child.tagName));
      if (semantic || inlineOnly) {
        const text = (node.innerText || node.textContent || '').trim();
        if (!text || blocks.some((b) => b.text === text)) return;
        size += text.length;
        blocks.push({ kind: node.tagName === 'PRE' ? 'code' : /^H[1-6]$/.test(node.tagName) ? 'heading' : 'text', text: text.slice(0, 10000) });
      } else children.forEach(visit);
    }
    visit(document.body);
    return blocks;
  }
  let initialized = false;
  function ready() {
    if (initialized) return;
    const ed = editor();
    if (!ed) return;
    initialized = true;
    let config = {};
    try {
      config = JSON.parse(document.getElementById('widget-config')?.textContent || '{}');
    } catch {}
    if (!Object.keys(config).length && typeof WIDGET_CONFIG !== 'undefined') config = WIDGET_CONFIG;
    const reference = document.querySelector('#solution pre,pre#solution,.solution-panel pre');
    const description =
      config.description ||
      document.querySelector(
        '.description,.subtitle,.challenge-description,.mission-description,header p',
      )?.textContent ||
      '';
    send({
      kind: 'ready',
      code: ed.read(),
      title: document.querySelector('h1,h2')?.textContent || '',
      description,
      context: lessonContext(),
      hints: Array.isArray(config.hints) ? config.hints : [],
      solution: config.solution || reference?.textContent || '',
      language: config.language || '',
    });
    snapshot();
  }
  const timer = setInterval(ready, 250);
  setTimeout(() => {
    clearInterval(timer);
    if (!initialized) send({ kind: 'unsupported' });
  }, 15000);
  let observer, debounce;
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.__maicLegacyCommand !== true) return;
    const ed = editor();
    if (!ed) {
      send({ kind: 'unsupported' });
      return;
    }
    if (event.data.kind === 'write') {
      ed.write(String(event.data.code));
      return;
    }
    if (event.data.kind !== 'run') return;
    ed.write(String(event.data.code));
    const run =
      document.getElementById('run-btn') ||
      Array.from(document.querySelectorAll('button')).find((b) =>
        /run.*(?:test|verify|code)/i.test(b.textContent),
      );
    if (!run) {
      send({ kind: 'unsupported' });
      return;
    }
    observer?.disconnect();
    observer = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(snapshot, 100);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    try {
      run.click();
      snapshot();
    } catch (error) {
      send({ kind: 'error', output: String(error.message || error) });
    }
  });
  window.addEventListener('load', ready);
  ready();
})();
`;

export const CODE_EXERCISE_RUNTIME =
  `const workerSource=${JSON.stringify(WORKER_RUNTIME)},domSource=${JSON.stringify(DOM_RUNTIME)},legacyBridge=${JSON.stringify(LEGACY_BRIDGE)};\n` +
  String.raw`
(function () {
  const $ = (id) => document.getElementById(id),
    config = JSON.parse($('widget-config').textContent),
    legacy = JSON.parse($('maic-legacy-source').textContent);
  const code = $('code-input'),
    run = $('run-btn'),
    stop = $('stop-btn'),
    output = $('output'),
    tests = $('tests'),
    preview = $('preview'),
    legacyFrame = $('legacy-frame');
  let worker = null,
    workerUrl = null,
    deadline = null,
    loaded = !legacy,
    runActive = false,
    edited = false;
  let starter = config.starterCode || '',
    cm = null;
  function setCode(value) {
    code.value = value;
    if (cm && cm.getValue() !== value) cm.setValue(value);
  }
  function script(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = reject;
      document.head.appendChild(el);
    });
  }
  script('/exercise-runtime/codemirror/codemirror.js')
    .then(() =>
      Promise.all([
        script('/exercise-runtime/codemirror/javascript.js'),
        script('/exercise-runtime/codemirror/python.js'),
        script('/exercise-runtime/codemirror/runmode.js'),
      ]),
    )
    .then(() => {
      cm = CodeMirror.fromTextArea(code, {
        lineNumbers: true,
        theme: 'dracula',
        mode:
          config.language === 'python'
            ? 'python'
            : config.language === 'typescript'
              ? 'text/typescript'
              : 'javascript',
        lineWrapping: true,
        indentUnit: 2,
      });
      cm.getInputField().setAttribute('aria-label', 'Exercise code');
      document.dispatchEvent(new Event('maic-syntax-ready'));
      cm.on('change', () => {
        code.value = cm.getValue();
        code.dispatchEvent(new Event('input', { bubbles: true }));
      });
    })
    .catch(() => {
      /* Keep the fully functional textarea if editor assets cannot load. */
    });
  code.value = starter;
  $('exercise-title').textContent = config.title || 'Code exercise';
  $('description').textContent =
    config.description ||
    'This older exercise did not provide separate instructions. Open its original interactive preview to inspect the full task.';
  code.addEventListener('input', () => {
    edited = true;
    if (legacy && loaded)
      legacyFrame.contentWindow.postMessage(
        { __maicLegacyCommand: true, kind: 'write', code: code.value },
        '*',
      );
  });
  function setConfig(next) {
    Object.assign(config, next);
    $('widget-config').textContent = JSON.stringify(config);
  }
  function paintTest(el, description, state = 'idle', message = '') {
    el.dataset.state = state;
    el.dataset.description = description;
    const title = document.createElement('span');
    title.className = 'test-description';
    title.textContent = description.replace(/\s*(?:[—–]\s*)?(?:NOT RUN|PASSED|FAILED)\s*$/i, '').trim();
    const badge = document.createElement('span');
    badge.className = 'test-badge';
    badge.textContent = state === 'passed' ? '✓ Passed' : state === 'failed' ? '✕ Failed' : state === 'running' ? 'Running…' : 'Not run';
    el.replaceChildren(title, badge);
    if (message) {
      const detail = document.createElement('div');
      detail.className = 'test-detail';
      detail.textContent = String(message).slice(0, 4000);
      el.appendChild(detail);
    }
  }
  function row(test) {
    const el = document.createElement('div');
    el.className = 'test';
    el.dataset.id = test.id;
    paintTest(el, test.description, test.state || 'idle');
    tests.appendChild(el);
  }
  function summarizeTests() {
    const rows = Array.from(tests.querySelectorAll('.test'));
    const passed = rows.filter((el) => el.dataset.state === 'passed').length;
    const failed = rows.some((el) => el.dataset.state === 'failed');
    $('test-summary').textContent = rows.length ? passed + '/' + rows.length + ' Passing' : '';
    const state = failed ? 'failed' : rows.length && passed === rows.length ? 'passed' : 'idle';
    $('test-summary').dataset.state = state;
    output.dataset.state = state;
  }
  new MutationObserver(summarizeTests).observe(tests, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
  (config.testCases || []).forEach(row);
  if (!tests.childElementCount) {
    tests.textContent = 'Run the exercise to see its checks.';
    tests.style.padding = '12px';
  }
  function stopRun(message) {
    clearTimeout(deadline);
    if (worker) {
      worker.terminate();
      worker = null;
    }
    if (workerUrl) {
      URL.revokeObjectURL(workerUrl);
      workerUrl = null;
    }
    run.disabled = !loaded;
    stop.hidden = true;
    runActive = false;
    if (message) output.textContent = message;
  }
  function startRun() {
    runActive = true;
    run.disabled = true;
    stop.hidden = false;
    output.textContent = 'Running…';
    Array.from(tests.children).forEach((el) => {
      paintTest(el, el.dataset.description || el.textContent, 'running');
    });
    deadline = setTimeout(
      () => {
        preview.srcdoc = '';
        stopRun('Execution timed out. Shorten the operation and try again.');
      },
      config.language === 'python' ? 90000 : 15000,
    );
  }
  function result(data) {
    if (!runActive) return;
    if (data.kind === 'test') {
      const el = Array.from(tests.children).find((e) => e.dataset.id === data.id);
      if (el) {
        const test = config.testCases.find((t) => t.id === data.id);
        paintTest(el, test.description, data.state, data.message);
      }
    } else if (data.kind === 'done' || data.kind === 'error') {
      stopRun();
      output.textContent = String(data.output || '').slice(0, 100000);
    }
  }
  stop.onclick = () => {
    preview.srcdoc = '';
    if (legacy) {
      legacyFrame.srcdoc = '';
      loaded = false;
      $('runtime-status').textContent =
        'Original runtime stopped. Reload the lesson to initialize it again.';
    }
    stopRun('Execution stopped.');
  };
  $('reset-btn').onclick = () => {
    if (runActive) stop.click();
    setCode(starter);
    code.dispatchEvent(new Event('input', { bubbles: true }));
    output.textContent = 'Starter code restored.';
  };
  function documentWith(script) {
    return (
      '<!doctype html><html><head><meta charset="utf-8"></head><body><script>' +
      script.replace(/<\/script/gi, '<\\/script') +
      '</scr' +
      'ipt></body></html>'
    );
  }
  run.onclick = () => {
    if (!loaded || runActive) return;
    startRun();
    if (legacy) {
      legacyFrame.contentWindow.postMessage(
        { __maicLegacyCommand: true, kind: 'run', code: code.value },
        '*',
      );
      return;
    }
    if (config.fixtureHtml !== undefined || config.previewCode) {
      $('preview-card').hidden = false;
      preview.srcdoc = documentWith(domSource);
    } else {
      worker = new Worker(
        'data:text/javascript;charset=utf-8,' + encodeURIComponent(workerSource),
        { type: 'module' },
      );
      worker.onmessage = (e) => result(e.data);
      worker.onerror = (e) => {
        stopRun();
        output.textContent = e.message || 'Runtime could not load.';
      };
      worker.postMessage({ config, code: code.value });
    }
  };
  window.addEventListener('message', (event) => {
    if (event.source === preview.contentWindow && event.data?.__maicRunner) {
      if (event.data.kind === 'ready' && runActive)
        preview.contentWindow.postMessage({ kind: 'execute', config, code: code.value }, '*');
      else result(event.data);
    }
    if (!legacy || event.source !== legacyFrame.contentWindow || !event.data?.__maicLegacy) return;
    const data = event.data;
    if (data.kind === 'ready') {
      loaded = true;
      const context = $('lesson-context');
      context.replaceChildren();
      for (const block of Array.isArray(data.context) ? data.context.slice(0, 60) : []) {
        if (!block || typeof block.text !== 'string' || block.text.trim() === String(data.description).trim() || block.text.trim() === String(data.title).trim()) continue;
        const el = document.createElement(block.kind === 'code' ? 'pre' : block.kind === 'heading' ? 'h3' : 'p');
        el.textContent = block.text.slice(0, 10000);
        context.appendChild(el);
      }
      context.hidden = !context.childElementCount;

      starter = String(data.code || '');
      if (!edited) setCode(starter);
      if (cm && data.language)
        cm.setOption(
          'mode',
          data.language === 'python'
            ? 'python'
            : data.language === 'typescript'
              ? 'text/typescript'
              : 'javascript',
        );
      setConfig({
        starterCode: starter,
        solution: String(data.solution || ''),
        hints: Array.isArray(data.hints) ? data.hints.filter((h) => typeof h === 'string') : [],
      });
      if (!config.description && data.description) $('description').textContent = data.description;
      if (!config.title && data.title) $('exercise-title').textContent = data.title;
      $('runtime-status').textContent = '';
      run.disabled = false;
      window.__maicExerciseReady = true;
      document.dispatchEvent(new Event('maic-exercise-ready'));
    } else if (data.kind === 'results') {
      if (Array.isArray(data.rows) && data.rows.length) {
        tests.replaceChildren();
        for (const r of data.rows) {
          row(r);
        }
      }
      if (data.output) output.textContent = data.output;
      // Original runtimes vary. Preserve their reported state, never fabricate a pass.
      if (
        runActive &&
        ((data.rows?.length &&
          data.rows.every((r) => r.state === 'passed' || r.state === 'failed')) ||
          (!data.rows?.length && data.output && !/^running/i.test(data.output)))
      )
        stopRun();
    } else if (data.kind === 'unsupported') {
      $('runtime-status').textContent =
        'This exercise uses an unsupported editor or runner. Use the original interactive preview below.';
      run.disabled = true;
      loaded = false;
      window.__maicExerciseReady = true;
      document.dispatchEvent(new Event('maic-exercise-ready'));
    } else if (data.kind === 'error') {
      stopRun();
      output.textContent = data.output;
    }
  });
  if (legacy) {
    run.disabled = true;
    $('runtime-status').textContent = 'Loading original exercise runtime…';
    $('legacy-card').hidden = false;
    $('legacy-toggle').onclick = () => {
      legacyFrame.hidden = !legacyFrame.hidden;
      $('legacy-toggle').textContent = legacyFrame.hidden
        ? 'Open original interactive preview'
        : 'Close original interactive preview';
    };
    const tag = '<script>' + legacyBridge + '</scr' + 'ipt>';
    legacyFrame.srcdoc = legacy.includes('</body>')
      ? legacy.replace('</body>', tag + '</body>')
      : legacy + tag;
  }
})();
`;
