# Known incorrect repairs

Each script is applied to the untouched fixture during grader review and must
receive reward 0. The scripts start from the reference files in
`solution/files` (`SOLUTION_DIR`, `/solution` in Harbor) and change one
decision, so each one isolates a single wrong branch of the blocking-route and
instant-validation guidance.

| Script                      | Shortcut                                                                    | Rejected by                                           |
| --------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| `instant-false-per-page.sh` | Keeps the layout opt-out and adds `instant = false` to every workspace page | `check-source.mjs`                                    |
| `streamed-redirect.sh`      | Correct Suspense structure, but the redirect happens inside the stream      | `behavior.spec.ts`: signed-out visitors get a 200     |
| `connection-in-layout.sh`   | Removes the opt-out and blocks the layout with `await connection()`         | `next build`: blocking route                          |
| `conditional-children.sh`   | Renders the sign-in prompt instead of `{children}` when there is no session | `behavior.spec.ts`: page headings missing from shells |
| `no-io.sh`                  | Correct architecture, but the SDK's clock read stays inside the prerender   | server log check in `test.sh`                         |
| `edit-vendor.sh`            | Deletes the expiry check from the vendored SDK                              | `check-source.mjs`                                    |
