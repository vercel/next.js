We added smooth scrolling in our global CSS so the docs' table-of-contents anchors glide nicely. Since then, every regular page navigation slowly crawls from wherever you were up to the top of the new page — it should land at the top instantly like before.

Constraints:

- The TOC anchor links must keep their smooth glide.
- The changelog's next/prev pagination is built to keep your place in the list while swapping pages — that must keep working exactly as it does.
- Keep real client-side navigation.
- Keep the existing data-testid attributes.
