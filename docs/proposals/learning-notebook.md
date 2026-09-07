# Personal learning notebook — discussion draft

Status: first local prototype implemented on `feat/learning-notebook`; upstream discussion and review pending.

The prototype supports scene-level notes, bookmarks, review-later flags, search, navigation, Markdown export, and JSON backup/import. It stores personal records in a separate browser IndexedDB database, with revision checks against stale writers. Imports add missing records without overwriting existing notes. Notes are scoped to the browser origin; switching ports or browsers requires a backup transfer, and imported course copies with new IDs are not automatically relinked.

Action-level bookmarks, deletion controls, account synchronization, and a public plugin SDK remain future work. The initial UI edits Markdown as plain text.

## Problem

Learners need to record their own notes and return to difficult course sections. Existing lecture notes represent narration and actions, rather than a personal notebook.

## First milestone

- A classroom notebook panel with autosaved Markdown notes.
- Bookmarks for a scene or narration action, with an optional reason.
- Review-later list with navigation back to the original context.
- Markdown/JSON export and import of personal learning records.
- Keyboard access and localized user-facing labels.

## Persistence and ownership

Store personal records separately from course content. Anchor them to course, scene, and optional action IDs; retain a title and excerpt snapshot for recovery. Reordering must preserve links. Deleting or regenerating a target must retain the note and mark the link unresolved rather than silently reattaching it. Course exports must exclude personal records unless explicitly requested. Define learner identity, storage backend, backup, migrations, and deletion semantics before implementation. Browser-only persistence must never be described as a backup.

## Extension direction

Start with a bounded notebook module and a small classroom integration surface. Candidate interfaces include current-course context, scene-change events, navigation, toolbar actions, and a sidebar slot. Do not introduce arbitrary third-party code loading or promise a stable plugin SDK in the first milestone. Establish a versioned extension contract only after concrete features demonstrate its requirements.

## Acceptance checks

Verify note save/reload, bookmark navigation, course isolation, scene reorder/delete, export privacy, import round-trip, keyboard use, and unchanged narration/playback. Include real browser verification before requesting review.

## Upstream discussion questions

1. Would learner-authored notes and bookmarks fit the project roadmap?
2. Which persistence and learner-identity contracts should personal records use?
3. Is a classroom sidebar the preferred UI location?
4. Would maintainers prefer direct features first, or a small reusable extension surface?

Propose this in Discussions before opening a new-feature PR, per CONTRIBUTING.md. Link an issue to each focused PR and disclose AI assistance.
