# Known incorrect repairs

Each script is applied to the untouched fixture during grader review and must
receive reward 0. The comment at the top of each script names the check that
rejects it. Together they cover every branch of the error page applied at the
wrong site, plus the opt-outs the feedback reports show agents reaching for.

| Script                     | Shortcut                                                              | Rejected by                                                   |
| -------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `connection-everywhere.sh` | Adds `await connection()` before every clock read                     | `behavior.spec.ts`: `/status` checked-at differs per request  |
| `client-everything.sh`     | Moves the year and checked-at into client effects                     | `behavior.spec.ts`: year and time missing from the HTML       |
| `instant-false.sh`         | Fixes three sites, opts `/account` out instead of fixing the SDK read | `check-source.mjs`; the server log would also still report it |
| `suppress-hydration.sh`    | Renders relative time on the server with `suppressHydrationWarning`   | `check-source.mjs`                                            |
| `hardcode-year.sh`         | Replaces the footer year with a literal                               | `check-source.mjs`                                            |
| `edit-vendor.sh`           | Patches `Date.now()` out of the vendored SDK                          | `check-source.mjs`                                            |
| `skip-sdk-fix.sh`          | Fixes the three build errors and stops once the build is green        | server log check in `test.sh`                                 |
| `adds-dependency.sh`       | Correct repairs plus a dev dependency and its own tests               | `check-source.mjs`: dependency sets changed                   |
