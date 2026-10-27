# Known incorrect repairs

Each script is applied to the untouched fixture during grader review. Every
one must receive reward 0, and the comment at the top of each script names the
check that rejects it.

| Script                     | Shortcut                                                      | Rejected by                                  |
| -------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `typegen-only.sh`          | Adds `next typegen` and stops                                 | `npm run typecheck` (layout key, slug array) |
| `handwritten-types.sh`     | Replaces the generated types with local prop types            | `check-source.mjs`                           |
| `ignore-errors.sh`         | Lets the typecheck script and build ignore type errors        | `check-source.mjs`                           |
| `commit-generated.sh`      | Commits `.next/types` so tsc finds the globals                | `check-patch.mjs`                            |
| `cast-slug.sh`             | Fixes the layout key but casts the catch-all slug to a string | `check-source.mjs`, `check-routes.mjs`       |
| `delete-grouped-layout.sh` | Deletes the marketing layout instead of fixing its route key  | `check-source.mjs`, `check-routes.mjs`       |
