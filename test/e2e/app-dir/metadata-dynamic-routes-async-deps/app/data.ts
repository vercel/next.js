// Async module: top-level await makes this an async module,
// which causes any transitive importer to also become async.
const data = await Promise.resolve({
  slugs: ['hello-world', 'another-post'],
})

export function getAllSlugs(): string[] {
  return data.slugs
}
