/** Escape JSON data blocks before the HTML parser can interpret strings as markup. */
export function repairWidgetConfigJson(html: string): string {
  const opening =
    /<script\b(?=[^>]*\bid\s*=\s*["']widget-config["'])(?=[^>]*\btype\s*=\s*["']application\/json["'])[^>]*>/i.exec(
      html,
    );
  if (!opening) return html;
  const start = opening.index + opening[0].length;
  let cursor = start;
  while (/\s/.test(html[cursor] ?? '') && cursor < html.length) cursor++;
  if (html[cursor] !== '{') return html;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (; cursor < html.length; cursor++) {
    const ch = html[cursor];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        const end = cursor + 1;
        // Never consume or reinterpret surrounding markup to guess at malformed JSON.
        if (!/^\s*<\/script\s*>/i.test(html.slice(end))) return html;
        try {
          const json = JSON.stringify(JSON.parse(html.slice(start, end)))
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026');
          return html.slice(0, start) + json + html.slice(end);
        } catch {
          return html;
        }
      }
    }
  }
  return html;
}

export interface ExerciseSupportLabels {
  title: string;
  hint: string;
  show: string;
  hide: string;
  apply: string;
  restore: string;
  missing: string;
  unsupported: string;
  preserved: string;
  restored: string;
}

/** Runs entirely inside the existing sandbox. It never executes the reference solution. */
export function exerciseSupportScript(labels: ExerciseSupportLabels): string {
  const serialized = JSON.stringify(labels).replace(/</g, '\\u003c');
  return `<script data-maic-exercise-support>
(function (labels) {
  function install() {
    if (document.getElementById('maic-exercise-support')) return;
    var element = document.getElementById('widget-config');
    if (!element) return;
    var config;
    try { config = JSON.parse(element.textContent); } catch (_) { return; }
    if (!config || config.type !== 'code') return;
    var hints = Array.isArray(config.hints) ? config.hints.filter(function (h) { return typeof h === 'string'; }) : [];
    var solution = typeof config.solution === 'string' ? config.solution : '';
    var referenceBlock = document.querySelector('#solution pre');
    if (!solution && referenceBlock) solution = referenceBlock.textContent || '';
    var hintIndex = 0;
    var savedAttempt = null;
    var savedAdapter = null;
    function editorAdapter() {
      var mirrors = document.querySelectorAll('.CodeMirror');
      if (mirrors.length === 1 && mirrors[0].CodeMirror) {
        var cm = mirrors[0].CodeMirror;
        return { read: function () { return cm.getValue(); }, write: function (value) { cm.setValue(value); cm.focus(); } };
      }
      var textarea = document.getElementById('code-input');
      if (textarea && textarea.tagName === 'TEXTAREA' && !textarea.disabled && !textarea.readOnly) {
        return { read: function () { return textarea.value; }, write: function (value) {
          textarea.value = value;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
          textarea.focus();
        } };
      }
      return null;
    }
    var host = document.createElement('section');
    host.id = 'maic-exercise-support';
    // Shadow DOM keeps lesson CSS and broad button selectors from altering these controls.
    var root = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = ':host{display:block;margin:12px;font:14px/1.5 system-ui;color:#e5e7eb}section{padding:14px;border:1px solid #475569;border-radius:10px;background:#172033}h2{font-size:15px;margin:0 0 10px}.controls{display:flex;flex-wrap:wrap;gap:8px}button{font:inherit;padding:6px 12px;border:1px solid #64748b;border-radius:6px;background:#26364c;color:#fff;cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:3px solid #67e8f9;outline-offset:2px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;background:#0f172a;padding:12px}p{margin:8px 0 0}';
    root.appendChild(style);
    var section = document.createElement('section');
    var heading = document.createElement('h2'); heading.textContent = labels.title;
    section.appendChild(heading);
    var controls = document.createElement('div'); controls.className = 'controls'; section.appendChild(controls);
    var status = document.createElement('p'); status.setAttribute('role', 'status');
    var hintOutput = document.createElement('div'); hintOutput.setAttribute('aria-live', 'polite');
    var code = document.createElement('pre'); code.hidden = true; code.textContent = solution; code.id = 'reference-solution';
    function button(text, handler) { var b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', handler); controls.appendChild(b); return b; }
    var hint = button(labels.hint + ' (0/' + hints.length + ')', function () {
      if (hintIndex >= hints.length) return;
      var p = document.createElement('p'); p.textContent = hints[hintIndex++]; hintOutput.appendChild(p);
      hint.textContent = labels.hint + ' (' + hintIndex + '/' + hints.length + ')'; hint.disabled = hintIndex >= hints.length;
    }); hint.disabled = !hints.length;
    var show = button(labels.show, function () { code.hidden = !code.hidden; show.textContent = code.hidden ? labels.show : labels.hide; show.setAttribute('aria-expanded', String(!code.hidden)); });
    show.disabled = !solution; show.setAttribute('aria-expanded', 'false'); show.setAttribute('aria-controls', code.id);
    var apply = button(labels.apply, function () {
      var adapter = editorAdapter();
      if (!adapter) { status.textContent = labels.unsupported; return; }
      if (savedAttempt === null) { savedAttempt = adapter.read(); savedAdapter = adapter; }
      adapter.write(solution); status.textContent = labels.preserved; restore.disabled = false; apply.disabled = true;
    }); apply.disabled = !solution;
    var restore = button(labels.restore, function () {
      if (savedAttempt === null || !savedAdapter) return;
      savedAdapter.write(savedAttempt); savedAttempt = null; savedAdapter = null;
      restore.disabled = true; apply.disabled = !solution; status.textContent = labels.restored;
    }); restore.disabled = true;
    if (!solution) status.textContent = labels.missing;
    else if (!editorAdapter()) {
      apply.disabled = true; status.textContent = labels.unsupported;
      // Some lessons create their editor only after an asynchronous library load.
      var observer = new MutationObserver(function () {
        if (editorAdapter()) { apply.disabled = false; status.textContent = ''; observer.disconnect(); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.addEventListener('pagehide', function () { observer.disconnect(); }, { once: true });
    }
    section.appendChild(status); section.appendChild(hintOutput); section.appendChild(code); root.appendChild(section);
    document.body.prepend(host);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(${serialized});
</script>`;
}
