---
'@next/eslint-plugin-next': patch
---

fix(eslint-plugin): respect custom pageExtensions in no-html-link-for-pages rule

The `@next/next/no-html-link-for-pages` ESLint rule now correctly recognizes pages when using custom `pageExtensions` in next.config.js/mjs/ts. This fixes false positives for projects using custom extensions like `.page.tsx` or `.mdx`.
