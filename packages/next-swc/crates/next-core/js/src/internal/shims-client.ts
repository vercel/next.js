import './shims'

// Necessary for Next.js to accept and handle the `webpackHMR` option properly
// in next-hydrate.js.
// @ts-expect-error next.js sets this as readonly in their `global.d.ts`
process.env.NODE_ENV = 'development'

// This is a fix for web-vitals.js not being linked properly.
globalThis.__dirname = ''
