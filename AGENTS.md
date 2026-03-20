This repository is a Bun and Electrobun desktop app. The main UI lives under src/views/main, with separate client and server workspaces also present in the repo.

Before making a non-trivial change, create a short plan that covers the files or areas you expect to touch, the main risk or behavior change, and how you will validate the result.

When editing code:
- Keep changes scoped to the task.
- Preserve unrelated user changes already in the worktree.
- Prefer fixing the root cause instead of layering on one-off patches.
- Update documentation when behavior, setup, or developer commands change.

Validation expectations:
- Run the smallest relevant checks first, then broader checks if the change affects shared code or packaging.
- For root, shared, or desktop-shell TypeScript changes, run npx tsc --noEmit -p tsconfig.json.
- For legacy client workspace changes, run npm run build --workspace=client.
- For server workspace changes, run npm run build --workspace=server.
- For packaging, CSS pipeline, or full app integration changes, run npm run build.
- If runtime behavior changed and local prerequisites are available, verify it with npm run dev.
- If a command cannot run because a required local dependency is missing, state that explicitly instead of implying validation succeeded.

Testing expectations:
- Add or update automated tests when the affected area already has a test harness.
- This repo currently does not define a dedicated automated test script or test suite, so do not claim tests passed unless you actually added and ran them.
- For bug fixes, add a regression test when practical. If that is not practical, document the manual verification performed.

Commit expectations:
- Do not create a commit unless the user explicitly asks for one.
- When a commit is requested, use a clear message that describes the behavior change.