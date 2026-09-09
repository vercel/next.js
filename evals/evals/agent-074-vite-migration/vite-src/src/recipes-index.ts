// Every markdown file under content/recipes/, keyed by relative path.
// Lazy: each value is a thunk that loads the raw file on demand, so recipe
// bodies never land in the main bundle — the grep audit depends on this.
export const recipes = import.meta.glob<string>('../content/recipes/*.md', {
  query: '?raw',
  import: 'default',
})
