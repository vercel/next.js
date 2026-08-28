// TODO(port): import.meta.glob is Vite-only — need to port.
//
// Next.js doesn't have Vite's glob imports, so the old index below can't work
// here. Stubbing it out to an empty map so the build passes while we figure
// out a Next-native replacement (fs.readdir on the server? an API route?).
//
// Original Vite implementation (src/docs-index.ts in the old repo):
//
// export const docs = import.meta.glob<string>('./content/*.md', {
//   query: '?raw',
//   import: 'default',
// })

export const docs: Record<string, () => Promise<string>> = {}
