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

/** Only code exercises opt into a responsive viewport; authored slides keep their canvas. */
export function isCodeExercise(html: string): boolean {
  const repaired = repairWidgetConfigJson(html);
  const match =
    /<script\b(?=[^>]*\bid\s*=\s*["']widget-config["'])(?=[^>]*\btype\s*=\s*["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/i.exec(
      repaired,
    );
  try {
    return Boolean(match && JSON.parse(match[1]).type === 'code');
  } catch {
    return false;
  }
}

export interface ExerciseSupportLabels {
  sceneNumber?: number;
  progress?: {
    saved: string;
    saving: string;
    error: string;
    status: string;
    inProgress: string;
    completed: string;
    review: string;
    assisted: string;
    reset: string;
  };
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
    // Keep authored controls and their event handlers; augment their own toolbar.
    var authoredButtons = Array.from(document.querySelectorAll('button'));
    var nativeHint = document.querySelector('button#hint-btn') || authoredButtons.find(function (b) { return /^(?:💡\\s*)?(?:need a hint|hint)(?:\\b)/i.test(b.textContent.trim()); });
    var nativeShow = document.querySelector('button#solution-toggle-btn') || authoredButtons.find(function (b) { return /^(?:reveal|show|hide) solution$/i.test(b.textContent.trim()); });
    var anchor = nativeShow || nativeHint;
    var toolbar = anchor && anchor.parentElement;
    // Let an authored console card consume unused space in its column.
    // Keep a bounded scrolling log instead of growing with every output line.
    var output = document.querySelector('#output, #console-output, #output-log');
    var outputCard = output && output.parentElement;
    var outputColumn = outputCard && outputCard.parentElement;
    if (outputColumn && outputCard.matches('.panel-box, .console-panel, .output-panel') &&
        getComputedStyle(outputColumn).display === 'flex' && getComputedStyle(outputColumn).flexDirection === 'column') {
      outputColumn.setAttribute('data-maic-output-column', '');
      outputCard.setAttribute('data-maic-output-card', '');
      output.setAttribute('data-maic-output-log', '');
      var outputStyle = document.createElement('style');
      outputStyle.textContent = '[data-maic-output-column]> *{flex-shrink:0}[data-maic-output-card]{display:flex!important;flex-direction:column!important;flex:1 0 180px!important;min-height:180px;box-sizing:border-box}[data-maic-output-log]{flex:1 1 0!important;min-height:100px!important;max-height:none!important;overflow:auto!important}';
      document.head.appendChild(outputStyle);
    }
    var hintIndex = 0;
    var savedAttempt = null;
    var savedAdapter = null;
    var assisted = false;
    var progressStatus = 'in-progress';
    var saveProgress = function () {};
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
    if (!toolbar) section.appendChild(heading);
    var controls = document.createElement('div'); controls.className = 'controls'; section.appendChild(controls);
    var status = document.createElement('p'); status.setAttribute('role', 'status');
    var hintOutput = document.createElement('div'); hintOutput.setAttribute('aria-live', 'polite');
    var code = document.createElement('pre'); code.hidden = true; code.textContent = solution; code.id = 'reference-solution';
    function setStatus(text) { status.textContent = text; if (toolbar) host.hidden = !text && code.hidden && !hintOutput.childElementCount; }
    function button(text, handler) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = text;
      b.addEventListener('click', handler);
      if (toolbar) { b.className = anchor.className; b.setAttribute('data-maic-exercise-action', ''); toolbar.appendChild(b); }
      else controls.appendChild(b);
      return b;
    }
    var hint = nativeHint || button(labels.hint + ' (0/' + hints.length + ')', function () {
      if (hintIndex >= hints.length) return;
      var p = document.createElement('p'); p.textContent = hints[hintIndex++]; hintOutput.appendChild(p); host.hidden = false;
      hint.textContent = labels.hint + ' (' + hintIndex + '/' + hints.length + ')'; hint.disabled = hintIndex >= hints.length;
    }); if (!nativeHint) hint.disabled = !hints.length;
    var show = nativeShow || button(labels.show, function () { code.hidden = !code.hidden; setStatus(status.textContent); show.textContent = code.hidden ? labels.show : labels.hide; show.setAttribute('aria-expanded', String(!code.hidden)); });
    if (!nativeShow) { show.disabled = !solution; show.setAttribute('aria-expanded', 'false'); show.setAttribute('aria-controls', code.id); }
    var apply = button(labels.apply, function () {
      var adapter = editorAdapter();
      if (!adapter) { setStatus(labels.unsupported); return; }
      if (savedAttempt === null) { savedAttempt = adapter.read(); savedAdapter = adapter; }
      assisted = true; adapter.write(solution); setStatus(labels.preserved); restore.disabled = false; apply.disabled = true; saveProgress();
    }); apply.disabled = !solution;
    var restore = button(labels.restore, function () {
      if (savedAttempt === null || !savedAdapter) return;
      savedAdapter.write(savedAttempt); savedAttempt = null; savedAdapter = null;
      restore.disabled = true; apply.disabled = !solution; setStatus(labels.restored);
    }); restore.disabled = true;
    if (!solution) setStatus(labels.missing);
    else if (!editorAdapter()) {
      apply.disabled = true; setStatus(labels.unsupported);
      // Some lessons create their editor only after an asynchronous library load.
      var observer = new MutationObserver(function () {
        if (editorAdapter()) { apply.disabled = false; setStatus(''); observer.disconnect(); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.addEventListener('pagehide', function () { observer.disconnect(); }, { once: true });
    }
    if (labels.progress) {
      var progressLabels = labels.progress;
      var hydrated = false;
      var initialCode = null;
      var lastSent = '';
      var requestId = 0;
      var statusSelect = document.createElement('select');
      statusSelect.setAttribute('aria-label', progressLabels.status);
      statusSelect.style.cssText = 'max-width:180px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:6px;padding:8px;font:13px system-ui';
      [['in-progress',progressLabels.inProgress],['completed',progressLabels.completed],['needs-review',progressLabels.review]].forEach(function (pair) {
        var option = document.createElement('option'); option.value = pair[0]; option.textContent = pair[1]; statusSelect.appendChild(option);
      });
      (toolbar || controls).appendChild(statusSelect);
      function post(payload) { window.parent.postMessage(Object.assign({__maicProgress:true},payload),'*'); }
      function ready() {
        var adapter = editorAdapter();
        if (!adapter) return;
        if (initialCode === null) initialCode = adapter.read();
        if (!hydrated) post({kind:'ready'});
      }
      saveProgress = function () {
        var adapter = editorAdapter();
        if (!adapter || !hydrated) return;
        var draft = {code:adapter.read(),savedAttempt:savedAttempt,assisted:assisted,status:progressStatus};
        var encoded = JSON.stringify(draft);
        if (encoded === lastSent) return;
        lastSent = encoded;
        setStatus(progressLabels.saving);
        post({kind:'save',draft:draft,requestId:++requestId});
      };
      statusSelect.addEventListener('change',function(){progressStatus=statusSelect.value;saveProgress();});
      if (nativeShow) nativeShow.addEventListener('click',function(){assisted=true;saveProgress();});
      else show.addEventListener('click',function(){assisted=true;saveProgress();});
      var reset = toolbar && toolbar.querySelector('#reset-btn');
      if (!reset) reset = button(progressLabels.reset,function(){ var a=editorAdapter(); if(a && initialCode !== null){savedAttempt=a.read();savedAdapter=a;a.write(initialCode);restore.disabled=false;progressStatus='in-progress';statusSelect.value=progressStatus;saveProgress();} });
      else reset.addEventListener('click',function(){var a=editorAdapter();if(a){savedAttempt=a.read();savedAdapter=a;restore.disabled=false;}progressStatus='in-progress';statusSelect.value=progressStatus;setTimeout(saveProgress,0);},true);
      window.addEventListener('message',function(event){
        if(event.source !== window.parent || !event.data || event.data.__maicProgress !== true) return;
        var message=event.data;
        if(message.kind==='request-ready') ready();
        if(message.kind==='restore' && !hydrated){
          var a=editorAdapter(); if(!a)return;
          hydrated=true;
          var d=message.draft;
          // Do not replace typing that happened while storage was loading.
          if(d && typeof d.code==='string' && a.read()===initialCode){
            a.write(d.code);savedAttempt=d.savedAttempt;savedAdapter=a;assisted=Boolean(d.assisted);
            progressStatus=d.status;statusSelect.value=progressStatus;restore.disabled=savedAttempt===null;
          }
          saveProgress();
        }
        if(message.kind==='saved' && message.requestId===requestId) setStatus(progressLabels.saved + (assisted ? ' · '+progressLabels.assisted : ''));
        if(message.kind==='error'){lastSent='';setStatus(progressLabels.error);}
      });
      var progressTimer=setInterval(function(){if(!hydrated)ready();else saveProgress();},500);
      document.addEventListener('input',saveProgress);
      document.addEventListener('change',saveProgress);
      window.addEventListener('pagehide',function(){saveProgress();clearInterval(progressTimer);},{once:true});
      ready();
    }
    section.appendChild(status); section.appendChild(hintOutput); section.appendChild(code); root.appendChild(section);
    if (toolbar) {
      // No second help bar: feedback appears only after an action needs it.
      host.hidden = !status.textContent;
      style.textContent += ':host([hidden]){display:none}section{padding:8px 12px;border:0;background:transparent}.controls{display:none}';
      var header = toolbar.closest('header');
      (header || toolbar).insertAdjacentElement('afterend', host);
      toolbar.setAttribute('data-maic-exercise-toolbar', '');
      if (header) header.setAttribute('data-maic-exercise-header', '');
      var run = toolbar.querySelector('#run-btn');
      var ordered = [hint, show, run, apply, restore].filter(function (b) { return b && b.parentElement === toolbar; });
      // Move the original nodes, preserving their handlers and hint counters.
      ordered.concat(Array.from(toolbar.children).filter(function (b) { return ordered.indexOf(b) < 0; })).forEach(function (b) { toolbar.appendChild(b); });
      if (run) run.setAttribute('data-maic-run', '');
      hint.setAttribute('data-maic-hint', '');
      var toolbarStyle = document.createElement('style');
      toolbarStyle.textContent = '\\n[data-maic-exercise-header]{background:#111827!important;padding:12px 20px!important;border-bottom:1px solid #334155!important;display:flex!important;align-items:center!important;justify-content:space-between!important;flex-wrap:wrap!important;gap:12px!important;flex-shrink:0!important}\\n[data-maic-exercise-header]>:not([data-maic-exercise-toolbar]){min-width:0;flex:1 1 280px}\\n[data-maic-exercise-toolbar]{display:flex!important;align-items:center!important;justify-content:flex-end!important;flex-wrap:wrap!important;gap:8px!important;max-width:100%;margin-left:auto}\\n[data-maic-exercise-toolbar]>button{box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;min-height:40px!important;padding:8px 14px!important;border:1px solid transparent!important;border-radius:6px!important;background:#334155!important;color:#e2e8f0!important;font:600 14px/1.4 system-ui,sans-serif!important;white-space:nowrap!important;cursor:pointer}\\n[data-maic-exercise-toolbar]>button[data-maic-hint]{background:#1e293b!important;border-color:#475569!important}\\n[data-maic-exercise-toolbar]>button[data-maic-run]{background:#8b5cf6!important;color:#fff!important}\\n[data-maic-exercise-toolbar]>button:disabled{opacity:.45!important;cursor:default!important}\\n[data-maic-exercise-toolbar]>button:focus-visible{outline:2px solid #67e8f9!important;outline-offset:2px!important}\\n@media(max-width:700px){[data-maic-exercise-toolbar]{justify-content:flex-start!important;margin-left:0;width:100%}[data-maic-exercise-header]{padding:12px!important}}';
      document.head.appendChild(toolbarStyle);
      if (Number.isInteger(labels.sceneNumber) && labels.sceneNumber > 0) {
        var number = document.createElement('span');
        number.setAttribute('data-maic-scene-number', '');
        number.textContent = String(labels.sceneNumber).padStart(2, '0');
        number.style.cssText = 'flex-shrink:0;padding:0 8px;color:#94a3b8;font:700 18px/1.4 system-ui';
        toolbar.appendChild(number);
      }
    } else document.body.prepend(host);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(${serialized});
</script>`;
}
