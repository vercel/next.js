# Known incorrect repairs

Each script is applied to the untouched fixture during grader review and must
receive reward 0. Scripts that start from the reference repair
(`_reference.sh`) change one decision, so each isolates a single wrong way to
meet the budgets.

| Script                        | Shortcut                                                  | Rejected by                                            |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| `images-only.sh`              | Switches photos to `next/image` and changes nothing else  | `behavior.spec.ts`: HTML and JavaScript over budget    |
| `icon-set-in-client.sh`       | Leaves the whole icon set in the client components        | `behavior.spec.ts`: JavaScript over budget             |
| `inline-stars.sh`             | Repeats the full star path inline on every card           | `behavior.spec.ts`: catalog HTML over budget           |
| `committed-resized-photos.sh` | Commits resized WebP copies instead of using `next/image` | `behavior.spec.ts`: the photos added later do not load |
| `drop-hidden-reviews.sh`      | Leaves out the reviews behind "Show all reviews"          | `behavior.spec.ts`: review count                       |
| `smaller-photos.sh`           | Shrinks the product photos on the page                    | `behavior.spec.ts`: image sizes                        |
| `adds-dependency.sh`          | Correct repair plus a new dependency                      | `check-source.mjs`: dependency sets changed            |
