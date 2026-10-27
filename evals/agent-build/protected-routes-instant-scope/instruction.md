Since we moved Ledger to Cache Components and Partial Prefetching, the workspace under `/app` has been a mess:

- Navigating between Overview, Invoices and Settings shows a blank page for a moment on every click. The build output lists all three routes as `ƒ` dynamic.
- Signed-out visitors get a 200 page saying "Sign in required". Our uptime checks and the mobile app expect an HTTP redirect to `/login`.
- When the workspace layout started blocking, the dev overlay told us to add `export const instant = false`, so we did. When we take it out again, the build fails with blocking-route errors on every workspace page.

Please fix the workspace so that:

- A request to any `/app` route without a session gets a real HTTP redirect to `/login` before any page HTML is sent. Expired sessions must never see workspace data either.
- Every workspace route navigates instantly for a signed-in user: the workspace frame (team navigation and the page heading) is visible immediately and the user's data streams in. The frame must not contain another customer's data.
- The invoice list still filters by the `status` query parameter, and signed-in users only ever see their own team's invoices and totals.
- `/`, `/pricing` and `/login` stay fully static.
- No route opts out of prerendering or instant validation, nothing suppresses warnings, and `lib/vendor/` stays untouched because it is a dependency.
- The production build passes and the production server logs stay free of prerender and validation errors while browsing signed out, signed in, and with an expired session.

CI installs the committed lockfile with no network access, so the fix must not add, remove, or upgrade dependencies.
