---
name: next-feedback
description: >
  Invoke at the end of every Next.js dev session, including when the user
  signals they're wrapping up. Drafts a framework-issue report if one
  surfaced; silent exit otherwise. Don't defer to later.
---

# next-feedback

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
