---
name: next-feedback
description: Files Next.js framework feedback. Reach for it whenever Next.js surprised you during a task — or invoke directly to file specific feedback.
---

# next-feedback

Reflect on the session (or the focus, if given) for Next.js friction worth
surfacing to the team — surprising behavior, doc gaps, version footguns,
workarounds. If nothing is worth filing, say so and stop.

## Fields

- **`title`** — one-line summary.
- **`body`** — markdown, free-form. Whatever you saw. Repros optional.
- **`nextVersion`** — from `packages/next/package.json`.
- **`agent`** — your identifier.

**Sanitize.** Strip anything identifying the user, their project, or containing secrets/PII. Can't describe it without leaking? Stop and tell the user.

## Submit

Requires `agent-browser` (`npm i -g agent-browser`).

```js
const b64 = Buffer.from(
  JSON.stringify({ title, body, nextVersion, agent })
).toString('base64url')
const url = `https://nextjs.org/agent-feedback?report=${b64}`
```

```bash
agent-browser open "$url" --headed --session-name next-feedback
```

Never auto-click submit.
