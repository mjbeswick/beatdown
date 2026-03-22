This repository is a macOS desktop app built with Electrobun, Bun, and React. All application code lives under `src/` — the bun (main process) side under `src/bun/`, the renderer under `src/views/main/`, and shared types and RPC schema under `src/shared/`. The `server/` and `client/` directories are a legacy workspace and are not part of the active app.

Before making a non-trivial change, create a short plan that covers the files or areas you expect to touch, the main risk or behaviour change, and how you will validate the result.

When editing code:
- Keep changes scoped to the task.
- Preserve unrelated user changes already in the worktree.
- Prefer fixing the root cause instead of layering on one-off patches.
- Update documentation when behaviour, setup, or developer commands change.

Validation expectations:
- For TypeScript changes, run `bunx tsc --noEmit` to check the whole project.
- For CSS pipeline changes, run `bun run build:css`.
- For full app integration or packaging changes, run `bun run build`.
- If runtime behaviour changed and local prerequisites are available, verify with `bun run dev`.
- If a command cannot run because a required local dependency is missing, state that explicitly instead of implying validation succeeded.

Testing expectations:
- Add or update automated tests when the affected area already has a test harness.
- This repo currently does not define a dedicated automated test script or test suite, so do not claim tests passed unless you actually added and ran them.
- For bug fixes, add a regression test when practical. If that is not practical, document the manual verification performed.

Commit expectations:
- Do not create a commit unless the user explicitly asks for one.
- When a commit is requested, use a clear message that describes the behaviour change.

Electrobun is a framework similar to Electron but uses Bun as the runtime instead of Node. The bun-side process uses Bun APIs directly. The renderer is a WebKit webview. Communication between the two sides uses a typed RPC layer defined in `src/shared/rpc-schema.ts` — add new calls there before implementing them on either side.
