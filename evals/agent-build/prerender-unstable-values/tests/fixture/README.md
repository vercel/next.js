# Pulse

Public status page and customer account area for Pulse monitoring.

- `/` and `/status` are public and must stay fully static. `/status` shows
  incident data that refreshes every few minutes and tells visitors when the
  data was last checked.
- `/account` is for signed-in customers. The customer is identified by the
  `pulse_customer` cookie; `/account/sign-in?as=<customer>` sets it for local
  testing.
- `lib/vendor/` holds the vendored customer SDK. Treat it like a dependency:
  we upgrade it, we do not edit it.

```bash
npm install
npm run dev
```
