Our synthetic monitor `scripts/check-redirects.mjs` validates the job application flow end to end: submitting the form on /apply must land the user on /done. It runs against a production build as `node scripts/check-redirects.mjs <base-url>` and exercises both submission styles — the plain no-JS form post and the fetch submission the hydrated page makes.

Since the framework upgrade the monitor reports the JS-style submission as broken (no redirect detected), but real users submitting in the browser land on /done just fine, and the old-school no-JS form post still checks out.

Fix things so the monitor accurately verifies the redirect for BOTH submission styles and exits 0. The application flow itself must keep using the form action it uses today, and a real redirect must keep happening on the server — don't paper over the check.
