# Shared exercise renderer

Code exercises now separate content from presentation. The `code-content` generation prompt returns `exerciseVersion: 1` JSON. The generation package validates it and builds HTML with the app-owned renderer. When opening a saved structured exercise, the classroom reconstructs its shell from the data using the current renderer, so UI improvements do not require regenerating a course.

## Contract and ownership

`packages/@openmaic/generation/src/code-exercise.ts` defines and validates the versioned content contract. Required fields include a visible task description, starter code, reference solution, progressive hints, and executable tests with stable unique IDs. Arbitrary layout fields are discarded. Invalid/incomplete model output follows the existing generation-failure path rather than displaying a partial playground.

`code-exercise-runtime.ts` owns execution and the editor, preview, test list, and output panels. The existing exercise-support module supplies the common action controls, hints/solution disclosure, and progress bridge. Layout comes exclusively from app code. The model may provide sample DOM in `fixtureHtml`; it is rendered only inside a separate sandboxed preview and cannot style the shell.

The editor uses locally bundled CodeMirror 5.65.16 (license retained under `public/exercise-runtime/codemirror`). A functional textarea remains if assets are unavailable. JavaScript runs in a terminable worker. TypeScript uses pinned Babel 7.28.5 and Python uses pinned Pyodide 314.0.6 loaded into a module worker. Those two language runtimes require network access on first load. DOM exercises run in a separate opaque-origin iframe. Code executes on Run; revealing/applying a solution does not execute it. Stop terminates workers and clears the child runtime. DOM/legacy code does not have the same preemptive termination guarantee as a worker.

## Existing courses

`lib/interactive/exercise-document.ts` is a rendering adapter; it never updates the stored scene HTML or its source hash. Legacy HTML executes in a separate opaque-origin iframe, while the common shell owns the visible layout. The bridge reads a single recognized editor, plain configuration, and reported test/output state. It invokes the original runner and never substitutes guessed assertions or fabricates passing results. Multiple/unknown editors are explicitly unsupported instead of selecting one arbitrarily.

An expandable original interactive preview preserves access to custom widgets and unsupported controls. It is closed by default. Some legacy pages lack a standalone description, structured tests, or complete reference solution; the shell cannot invent these and explains the limitation. Full normalized behavior is guaranteed by the new data contract, not by assuming every historical arbitrary HTML document exposes the same APIs.

Messages are accepted only from their owned child window. Existing parent-side progress validation, revision checks, and source hashing remain intact. The isolated runtime has no same-origin access to the main app's storage.

## Validation and rollout

Package tests cover contract validation, escaping, generation through structured output, and rejection of arbitrary HTML responses. Browser tests cover JavaScript/TypeScript/Python, DOM preview behavior, real legacy runner reports, layout isolation, responsive width, worker stop, and existing attempt restoration. Real exported pages 8 and 10 were checked through the compatibility shell. A real new model-generated course has not yet been sampled.

This work targets `local/learning-preview` on port 3100. Do not switch or restart the main port-3000 app while course generation is active. Preserve operator configuration using `scripts/prepare-standalone-runtime.mjs` during later activation. Rollback is the previous application build; course data needs no migration or rollback.
