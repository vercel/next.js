# page-weight-budgets

A working storefront (home, a 48-product catalog with filtering and sorting,
product pages, and an about page) is far heavier than it needs to be. The task
is to bring every page within stated HTML, JavaScript, and image byte budgets
without changing how anything looks or works, and to keep products and photos
added later within budget with no extra steps.

## Difficulty explanation

Nothing in the starting app produces an error or a warning. The weight comes
from the basics customer performance audits keep finding, spread across many
files:

- Raw `<img>` tags serving 300 KB photos, all loaded eagerly.
- The home and catalog pages are Client Components that import the whole
  800 KB catalog export, so it ships as JavaScript.
- Product pages pass the full product record and the entire catalog to a
  Client Component, so both are serialized into the HTML.
- A Client Component imports the whole design-system icon set.
- Every card repeats a 2.5 KB star path five times.

Each budget is stated, so an agent can measure its way to a pass. The
requirement that defeats one-off fixes is that photos and products added later
must stay within budget. Resizing today's photos by hand and committing the
copies meets every budget, but the verifier adds a product with new photos
before building, and those have no copies. In screening, a weaker model took
that route in both runs and a frontier model used `next/image`.

## Verification explanation

`tests/test.sh` applies the agent's patch to a clean copy of the fixture in a
separate, offline verifier, then runs these gates in order. The first failure
scores 0.

1. `before-build.sh` adds a 49th product with three new photos to
   `lib/catalog.json` and `public/photos`, the way the instruction says the
   catalog changes.
2. `check-source.mjs`: dependencies are unchanged.
3. Type check and production build.
4. `behavior.spec.ts` against the production server:
   - **Budgets:** in a 1280×800 Chromium window without scrolling, the
     uncompressed bytes of the HTML document, all JavaScript, and all images
     stay within budget on `/`, `/products`, `/about`, and five product pages,
     including the one added before the build.
   - **Behavior:** content, links, alt text, rendered image sizes, and every
     interaction match the starting app: filtering and sorting, saving, the
     gallery, "Show all reviews", the cart across navigation, and the
     newsletter form. Every image loads, including the new product's photos.
5. The production server log has no prerender errors.

Every check maps to a sentence in `instruction.md`. Expected content comes from
the baseline catalog, read from the verifier's own copy of the fixture, plus
the added product. `tests/bad-solutions/` lists shortcuts these gates reject,
and `tests/known-good/` holds reviewed passing solutions from screening.
