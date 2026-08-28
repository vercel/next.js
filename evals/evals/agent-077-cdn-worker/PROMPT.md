Since we moved our static assets onto the CDN domain (https://cdn.acme-static.example), the latency-crunching worker on the dashboard dies instantly in production. The browser console shows a security error complaining about the origin of the worker script, the `role="alert"` fallback renders, and the report never appears. Dev is unaffected — we only serve through the CDN in production builds.

Fix production so the cruncher runs again, with these constraints:

- Every other asset (page chunks, css, images) must keep loading from the CDN exactly as it does today. Serving everything same-origin again is not an option; the CDN migration stays.
- The worker stays a real module file in the app source and keeps being spawned the standard way. No fetching the script yourself and spinning it up from a blob, no copying worker files into `public/` and hardcoding paths, no inlining the worker code into the page.
- In production the browser has to load the worker from our own origin so it's allowed to run.
- We're on the default bundler and staying on it.

Verify with a production build (`npm run build`).
