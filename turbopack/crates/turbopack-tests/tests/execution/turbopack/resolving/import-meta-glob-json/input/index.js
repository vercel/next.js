// An eager `import.meta.glob` must produce the same module namespace a
// hand-written `import * as ns from '...'` produces, including the `default`
// export that the CommonJS interop adds for JSON and CommonJS modules.

import * as jsonNamespace from './data/data.json'
import * as cjsNamespace from './data/cjs.js'

const eager = import.meta.glob('./data/*', { eager: true })

it('should expose the default export of a JSON module', () => {
  expect(Object.keys(eager)).toEqual([
    './data/cjs.js',
    './data/data.json',
    './data/esm.mjs',
  ])
  expect(eager['./data/data.json'].default).toEqual({ hello: 'world' })
})

it('should match a hand-written namespace import for JSON', () => {
  expect(jsonNamespace.default).toEqual({ hello: 'world' })
  expect({ ...eager['./data/data.json'] }).toEqual({ ...jsonNamespace })
})

it('should match a hand-written namespace import for CommonJS', () => {
  expect(eager['./data/cjs.js'].default).toEqual({ hello: 'cjs' })
  expect({ ...eager['./data/cjs.js'] }).toEqual({ ...cjsNamespace })
})

it('should keep working for ES modules', () => {
  expect(eager['./data/esm.mjs'].default).toBe('esm')
  expect(eager['./data/esm.mjs'].value).toBe(7)
})

const eagerDefault = import.meta.glob('./data/*', {
  eager: true,
  import: 'default',
})

it('should support import: "default" eagerly', () => {
  expect(eagerDefault['./data/data.json']).toEqual({ hello: 'world' })
  expect(eagerDefault['./data/cjs.js']).toEqual({ hello: 'cjs' })
  expect(eagerDefault['./data/esm.mjs']).toBe('esm')
})

const lazy = import.meta.glob('./data/*')

it('should expose the default export of a JSON module lazily', async () => {
  const mod = await lazy['./data/data.json']()
  expect(mod.default).toEqual({ hello: 'world' })
})

const lazyDefault = import.meta.glob('./data/*', { import: 'default' })

it('should support import: "default" lazily', async () => {
  expect(await lazyDefault['./data/data.json']()).toEqual({ hello: 'world' })
  expect(await lazyDefault['./data/esm.mjs']()).toBe('esm')
})
