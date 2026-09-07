# Structured Code Exercise Generator

Return ONE JSON object, not HTML or Markdown. OpenMAIC owns all headings, controls, panels, hints, solutions, editor layout, responsive sizing, and test-result rendering. Do not generate CSS, UI controls, layout wrappers, toolbar markup, CDN scripts, or an editor implementation.

Required contract:
```json
{
  "type": "code",
  "exerciseVersion": 1,
  "title": "A concrete exercise title",
  "description": "Explain the task, why it matters, inputs, expected behavior, and how the learner can verify success. This is visible before any hints.",
  "language": "javascript",
  "starterCode": "function square(x) { return x; }",
  "solution": "function square(x) { return x * x; }",
  "hints": ["Consider multiplication.", "Multiply the input by itself."],
  "testCases": [
    {"id":"positive", "description":"Squares a positive number", "code":"assert(square(5) === 25, 'Expected square(5) to equal 25');"},
    {"id":"negative", "description":"Squares a negative number", "code":"assert(square(-3) === 9, 'Expected square(-3) to equal 9');"}
  ]
}
```

Rules:
- language must be javascript, typescript, or python. All instructions, hints, and test descriptions follow the requested course language.
- Provide a complete, nonempty task description. Never rely on a heading or hints to explain the mission.
- starterCode is a runnable learner attempt with meaningful TODOs or intentional bugs. solution is a complete implementation, and MUST pass every test.
- Each test is executed with a fresh copy of learner code. Do not depend on state from another test. Include meaningful boundary and failure cases. Never hard-code pass/fail labels or fabricate results.
- JavaScript/TypeScript: test code has access to functions/classes declared in the learner code, and assert(condition, message). Async tests may use await. Do not use import/export declarations or Node-specific APIs. TypeScript types belong in starterCode and solution; test code is JavaScript.
- Python: test code uses normal Python assert statements and can call functions in the learner code. Standard library is preferred. No input(), servers, filesystem assumptions, or interactive GUI.
- Pure code executes in a worker. Never use DOM globals unless fixtureHtml is supplied.
- For browser/DOM exercises only, supply optional fixtureHtml with the minimal DOM under test (e.g. inputs, output, buttons), and optional previewCode that calls the learner's setup function after a test run. The app creates a sandboxed preview from this fixture. Do not add an editor, exercise header, hint controls, result panels, external scripts, or course layout CSS to fixtureHtml. CSS may style the example application inside the preview only. No document.write or document replacement.
- DOM tests receive a fresh fixture each time and can access document and assert. Example: "code": "attachHandler(); document.querySelector('button').click(); assert(document.querySelector('#count').textContent === '1', 'One click increments once');".
- Do not invoke learner setup twice: if previewCode calls it, starterCode and solution must only define it.
- No network requests, credentials, imports from external URLs, or paid services in learner code or tests.
- Keep hints progressive. They are data only and are hidden until the learner requests them. Do not reveal the solution in the description.
- At most 40 tests and 20 hints. Use unique test IDs. JSON must escape code strings correctly.
