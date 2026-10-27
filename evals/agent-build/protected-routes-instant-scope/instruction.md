Since we moved Ledger to Cache Components, clicking between Overview, Invoices and Settings under `/app` shows a blank page every time, and the build lists all three routes as dynamic. When the workspace layout started blocking, the dev overlay told us to add `export const instant = false`, and taking it out again breaks the build.

Signed-out visitors also get a 200 page saying "Sign in required", but our uptime checks and mobile app need a real HTTP redirect to `/login`.

Please make workspace navigation instant again and redirect signed-out or expired sessions to `/login`. People must only ever see their own team's data, everything else should keep working as it does now, and the production server shouldn't log prerender errors.

`lib/vendor/` is a third-party SDK we don't edit, and CI installs the committed lockfile offline, so don't change dependencies.
