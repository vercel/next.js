# Ledger

Invoicing for small teams. Marketing pages at `/` and `/pricing`; the signed-in
workspace lives under `/app`.

- Sessions are the `ledger_session` cookie, verified through the vendored
  session SDK in `lib/vendor/`. Treat `lib/vendor/` like a dependency: we
  upgrade it, we do not edit it.
- `/login` signs in. For local testing, `/login/as?user=ada` sets a session
  cookie and sends you to the workspace.

```bash
npm install
npm run dev
```
