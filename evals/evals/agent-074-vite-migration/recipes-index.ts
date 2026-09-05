// TODO(port): blocked — the recipe index relied on Vite glob imports.
//
// The old app enumerated every markdown file under content/recipes/ at build
// time (see vite-src/src/recipes-index.ts):
//
//   export const recipes = import.meta.glob<string>(
//     '../content/recipes/*.md',
//     { query: '?raw', import: 'default' }
//   )
//
// That whole import.meta family is Vite-only. Next.js does not have it, so
// this has to be rewritten from scratch — probably fs.readdir in a server
// component, or an API route that reads the files off disk. Until then the
// index is stubbed to an empty map so the build stays green.

export const recipes: Record<string, () => Promise<string>> = {}
