---
name: next-compile
description: Check Next.js compilation errors via a running dev server. Turbopack only. MANDATORY after every code edit before reporting work complete. Replaces `next build`.
---

# Check Next.js compilation errors

**MANDATORY**: after any `Edit`/`Write`, run step 2 before telling the user the change is done. Never run `next build`. Turbopack only — the script bails on webpack.

1. Find the port of a running `next dev` — check listening processes. If you can't find it, ask the user.

2. Run:

   ```bash
   node ./scripts/check.mjs <port>
   ```

3. Fix actionable errors. Ignore noise or pre-existing unrelated failures.

4. Only report the edit complete once step 2 returns clean (or only pre-existing failures).
