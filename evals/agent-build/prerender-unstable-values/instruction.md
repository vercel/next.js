We turned on Cache Components and Partial Prefetching for Pulse and the production build now fails:

```
Error: Route "/": Next.js encountered the unstable value `new Date()` while prerendering.
This value can change between renders, so it must be either prerendered or computed later.
    at d (components/footer.tsx:2:16)
Export encountered an error on /page: /, exiting the build.
```

Every time we apply one of the suggested fixes another route fails, and a colleague said the production server kept logging the same kind of error after the build went green. Please get the production build passing and the production server logs free of prerender errors while browsing signed out and signed in.

What has to hold:

- `/` and `/status` stay fully static. Their server HTML must be complete without JavaScript, including the footer year and the "Checked at" time on `/status`.
- "Checked at" means when the incident data was fetched. Every visitor sees the same value until the incident data refreshes.
- Each incident shows when it started. The server HTML can show an absolute time; in the browser it must become a live relative time ("3 days ago") that keeps updating, without hydration warnings.
- `/account` keeps its instant shell and shows the signed-in customer's name, plan and monitor count; signed-out visitors see the sign-in prompt.
- `lib/vendor/` is a dependency we upgrade, not code we edit.
- No route may opt out of prerendering or instant validation, and no warning may be suppressed.

CI installs the committed lockfile with no network access, so the fix must not add, remove, or upgrade dependencies.
