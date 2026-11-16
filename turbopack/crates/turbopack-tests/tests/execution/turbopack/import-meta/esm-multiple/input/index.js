import { foo, bar } from './mod.mjs'

const { fileURLToPath } = require('url')
const fs = require('fs')

function expectSourceFileUrl(url) {
  expect(url).toMatch(
    /^file:\/\/\/.*\/import-meta\/esm-multiple\/input\/mod\.mjs$/
  )
  expect(fs.existsSync(fileURLToPath(url))).toBe(true)
}

it('supports multiple import.meta usages in a module', () => {
  expectSourceFileUrl(foo().url)
  expectSourceFileUrl(bar().url)
  // All usages share the same object
  expect(foo()).toBe(bar())
})

it('exposes the properties of import.meta', () => {
  const meta = foo()
  expect(Object.keys(meta)).toEqual(['url', 'env'])
  expectSourceFileUrl(meta.url)
  // Vite-compatible environment information, derived from the compile-time environment.
  expect(meta.env).toEqual({
    BASE_URL: '/',
    DEV: false,
    MODE: 'production',
    PROD: true,
    SSR: true,
  })
})
