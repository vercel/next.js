Since we moved Ledger to Cache Components, clicking between Overview, Invoices and Settings under `/app` shows a blank page every time, and the build lists all three routes as dynamic. When the workspace layout started blocking, the dev overlay told us to add `export const instant = false`, and taking it out again breaks the build.

Signed-out visitors also get a 200 page saying "Sign in required", but our uptime checks and mobile app need a real HTTP redirect to `/login`.

Please make workspace navigation instant again, so the workspace frame and page heading show immediately, and redirect signed-out or expired sessions to `/login`. Keep Cache Components on, and keep the marketing pages and `/login` static. People must only ever see their own team's data, and everything else, including the invoice status filter, should keep working as it does now. The production build and type check must pass, and the production server shouldn't log prerender or validation errors.

`lib/vendor/` is a third-party SDK we don't edit, and CI installs the committed lockfile offline, so don't change dependencies.
