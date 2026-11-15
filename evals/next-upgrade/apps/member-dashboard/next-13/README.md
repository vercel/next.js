# Next.js 13 member dashboard

The home page greets the member identified by the `member` cookie and displays
the request's `accept-language` header. Missing cookies show Guest. These values
must stay isolated between visitors. `/api/viewer` returns the same request
identity.

Use `npm run lint`, `npm run typecheck`, `npm run build`, and `npm start` to
check the app.
