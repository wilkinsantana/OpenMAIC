import { CODE_EXERCISE_RUNTIME } from './code-exercise-runtime.js';

/** Data-only contract. UI markup and styling are deliberately not part of it. */
export interface CodeExercise {
  type: 'code';
  exerciseVersion: 1;
  title: string;
  description: string;
  language: 'javascript' | 'typescript' | 'python';
  starterCode: string;
  solution: string;
  hints: string[];
  testCases: { id: string; description: string; code: string }[];
  fixtureHtml?: string;
  previewCode?: string;
}

export function parseCodeExercise(value: unknown): CodeExercise | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const text = (s: unknown, max = 100_000): s is string => typeof s === 'string' && s.length <= max;
  if (
    v.type !== 'code' ||
    v.exerciseVersion !== 1 ||
    !['javascript', 'typescript', 'python'].includes(String(v.language)) ||
    !text(v.title, 300) ||
    !v.title.trim() ||
    !text(v.description, 20_000) ||
    !v.description.trim() ||
    !text(v.starterCode) ||
    !text(v.solution) ||
    !v.solution.trim() ||
    !Array.isArray(v.hints) ||
    v.hints.length > 20 ||
    !v.hints.every((h) => text(h, 10_000)) ||
    !Array.isArray(v.testCases) ||
    !v.testCases.length ||
    v.testCases.length > 40
  )
    return null;
  const ids = new Set<string>();
  for (const t of v.testCases) {
    if (
      !t ||
      !text(t.id, 100) ||
      !t.id ||
      ids.has(t.id) ||
      !text(t.description, 2000) ||
      !text(t.code, 20_000) ||
      !t.code.trim()
    )
      return null;
    ids.add(t.id);
  }
  if (v.fixtureHtml !== undefined && !text(v.fixtureHtml)) return null;
  if (v.previewCode !== undefined && !text(v.previewCode, 20_000)) return null;
  if (v.language === 'python' && (v.fixtureHtml || v.previewCode)) return null;
  return {
    type: 'code',
    exerciseVersion: 1,
    title: v.title,
    description: v.description,
    language: v.language as CodeExercise['language'],
    starterCode: v.starterCode,
    solution: v.solution,
    hints: v.hints as string[],
    testCases: v.testCases.map((t) => ({ id: t.id, description: t.description, code: t.code })),
    fixtureHtml: v.fixtureHtml as string | undefined,
    previewCode: v.previewCode as string | undefined,
  };
}

export function exerciseJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** One app-owned shell, also used for legacy exercises via an isolated runner. */
export function renderCodeExerciseHtml(config: Partial<CodeExercise>, legacyHtml?: string): string {
  return `<!doctype html><html data-maic-exercise-shell="1"><head><meta charset="utf-8"><link rel="stylesheet" href="/exercise-runtime/codemirror/codemirror.css"><link rel="stylesheet" href="/exercise-runtime/codemirror/dracula.css"><style>
  *{box-sizing:border-box}html,body{margin:0;height:100%;font:14px/1.5 system-ui;color:#e2e8f0;background:#101827}body{display:flex;flex-direction:column;overflow:hidden}
  header{flex:none;padding:12px 16px;border-bottom:1px solid #334155}h1{font-size:18px;margin:0}h2{font-size:14px;margin:0;padding:10px 12px;border-bottom:1px solid #334155}p{margin:0;white-space:pre-wrap}button{cursor:pointer}button:disabled{cursor:default;opacity:.5}
  .workspace{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding:0 12px 12px;overflow:auto}
  .pane{min-width:0;min-height:0;display:flex;flex-direction:column;gap:12px;overflow:auto}.card{border:1px solid #334155;border-radius:8px;overflow:hidden;background:#172033;flex:none}.editor-card{flex:1;min-height:260px;display:flex;flex-direction:column}
  textarea{resize:none;flex:1;min-height:160px;width:100%;padding:14px;border:0;background:#202431;color:#e2e8f0;font:14px/1.6 ui-monospace,monospace;tab-size:2;outline-offset:-3px}textarea:focus{outline:2px solid #67e8f9}.CodeMirror{flex:1;height:auto;min-height:160px;font:14px/1.6 ui-monospace,monospace}.CodeMirror-scroll{min-height:160px}
  .editor-card>h2{color:#67e8f9;background:#10273a;border-bottom-color:#155e75}.editor-card{border-color:#155e75}#instructions-card{border-color:#65509b}#instructions-card>h2{color:#c4b5fd;background:#282044}#instructions-card #description{background:#1d203b}#description{padding:12px}#preview-card{border-color:#0891b2}#preview-card>h2{color:#67e8f9;background:#123044}#test-heading{color:#a5f3fc;background:#142a38}#tests{padding:10px;display:flex;flex-direction:column;gap:8px}.test{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;padding:12px;border:1px solid #475569;border-left:3px solid #64748b;border-radius:6px;background:#1e293b}.test-description{flex:1;min-width:160px;white-space:pre-wrap}.test-badge{flex:none;font-size:12px;font-weight:700;padding:2px 8px;border-radius:4px;background:#334155;color:#cbd5e1}.test-detail{flex-basis:100%;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 ui-monospace,monospace}.test[data-state=passed]{border-color:#23634f;border-left-color:#34d399;background:#102c26}.test[data-state=passed] .test-badge{color:#6ee7b7;background:#14533e}.test[data-state=failed]{border-color:#7f3948;border-left-color:#fb7185;background:#311d2a}.test[data-state=failed] .test-badge{color:#fda4af;background:#692838}.test[data-state=failed] .test-detail{color:#fecdd3}.test[data-state=running]{border-left-color:#fbbf24}.test[data-state=running] .test-badge{color:#fde68a;background:#57401c}.output-panel>h2{color:#93c5fd;background:#16283e}
  [data-maic-hints-area]{flex:none!important;border-color:#7356aa!important;background:#211d38!important}[data-maic-hints-area]>h2{color:#c4b5fd;border:0;padding:0}[data-maic-hints-area]>h2[data-maic-solution-heading]{color:#6ee7b7}

  .output-panel{flex:1;min-height:180px;display:flex;flex-direction:column}#output{flex:1;min-height:100px;margin:0;padding:12px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#080f1c;font:13px/1.5 ui-monospace,monospace}
  #test-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}#test-summary{font-size:12px;color:#94a3b8}#test-summary[data-state=passed],#output[data-state=passed]{color:#34d399}#test-summary[data-state=failed],#output[data-state=failed]{color:#fda4af}
  #lesson-context{padding:0 12px 12px;display:flex;flex-direction:column;gap:10px}#lesson-context[hidden]{display:none}#lesson-context p{padding:10px 12px;border-left:3px solid #a78bfa;background:#25213b;border-radius:5px}#lesson-context h3{font-size:13px;color:#c4b5fd;margin:4px 0}#lesson-context pre{margin:0;padding:12px;border:1px solid #334155;border-radius:6px;background:#080f1c;color:#67e8f9;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 ui-monospace,monospace}
  #runtime-status{font-size:12px;color:#94a3b8}#preview{width:100%;height:260px;border:0;background:white}#preview-card[hidden],#legacy-frame[hidden]{display:none}#legacy-frame{width:100%;height:500px;border:0;background:white}#legacy-toggle{margin:8px;padding:8px;background:#334155;color:#e2e8f0;border:1px solid #64748b;border-radius:6px;font:inherit}#stop-btn{padding:8px;background:#334155;color:#fff;border:1px solid #64748b;border-radius:6px}
  @media(max-width:760px){.workspace{grid-template-columns:1fr}.pane{display:contents;overflow:visible;min-height:auto}#instructions-card{order:-2}.editor-card{order:-1}.editor-card{height:340px;flex:none}.output-panel{min-height:220px}body{overflow:auto}.workspace{flex:none;overflow:visible} }
  </style><script type="application/json" id="widget-config">${exerciseJson({ ...config, type: 'code' })}</script>
  <script type="application/json" id="maic-legacy-source">${exerciseJson(legacyHtml ?? null)}</script></head><body>
  <header><h1 id="exercise-title"></h1><span id="runtime-status" role="status"></span><div class="controls"><button id="reset-btn">Reset</button><button id="run-btn">Run &amp; Verify</button><button id="stop-btn" hidden>Stop</button></div></header>
  <main class="workspace"><section class="pane"><section class="card editor-card"><h2>Code editor</h2><textarea id="code-input" aria-label="Exercise code" spellcheck="false"></textarea></section></section>
  <aside class="pane"><section class="card" id="instructions-card"><h2>Instructions</h2><p id="description"></p><div id="lesson-context" hidden></div></section><section class="card" id="preview-card" hidden><h2>Live preview</h2><iframe id="preview" sandbox="allow-scripts" title="Exercise preview"></iframe></section><section class="card"><h2 id="test-heading">Verification tests<span id="test-summary" aria-live="polite"></span></h2><div id="tests"></div></section><section class="card output-panel"><h2>Execution output</h2><pre id="output" aria-live="polite">Run the code to see results.</pre></section><section class="card" id="legacy-card" hidden><button id="legacy-toggle">Open original interactive preview</button><iframe id="legacy-frame" title="Original exercise runtime" sandbox="allow-scripts" hidden></iframe></section></aside></main>
  <script>${CODE_EXERCISE_RUNTIME}</script></body></html>`;
}
