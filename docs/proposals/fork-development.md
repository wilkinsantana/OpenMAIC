# Fork development workflow

- `upstream`: official THU-MAIC/OpenMAIC repository.
- `origin`: personal fork.
- `main`: pristine upstream baseline.
- `local/integration`: tested local deployment changes.
- `feat/learning-notebook`: independent feature development from upstream main.

Develop in a separate Git worktree; do not switch the running application's checkout to an experimental branch. Use a separate development port and browser origin. Before using server-backed persistence, assign a separate development database and asset location. Keep `.env.local`, credentials, personal course content, and operational logs out of commits.

Start development with `pnpm exec next dev --hostname 127.0.0.1 --port 3100`.

For upgrades, fetch upstream, inspect release notes and migrations, test in the development checkout, back up course data and the working build, then integrate and deploy deliberately. Avoid unreviewed pull-and-rebuild updates to the running service. Keep feature branches focused so accepted upstream changes can replace local patches.

Before proposing UI or architecture changes upstream, follow CONTRIBUTING.md and discuss a concrete design. Ready-for-review PRs require the documented checks, focused tests, screenshots, and manual regression verification.
