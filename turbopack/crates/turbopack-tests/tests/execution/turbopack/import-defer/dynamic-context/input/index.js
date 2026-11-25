import { log } from './log.js'

function load(name) {
  return import.defer(`./ctx/${name}.js`)
}

it('should load modules of a dynamic request without evaluating them', async () => {
  const ns = await load('esm')
  expect(log).toEqual([])
  expect(ns.then).toBeUndefined()
  // Known exports: getters, enumerable without evaluation (accepted deviation)
  expect(Object.keys(ns).sort()).toEqual(['default', 'value'])
  expect(log).toEqual([])
  expect(ns.value).toBe('esm-value')
  expect(ns.default).toBe('esm-default')
  expect(log).toEqual(['esm'])
})

it('should create a Proxy namespace for CommonJS modules of a dynamic request', async () => {
  const ns = await load('cjs')
  expect(log).not.toContain('cjs')
  expect(ns.then).toBeUndefined()
  expect(log).not.toContain('cjs')
  expect(ns.value).toBe('cjs-value')
  expect(log).toContain('cjs')
})

it('should evaluate async modules of a dynamic request eagerly', async () => {
  const ns = await load('tla')
  expect(log).toContain('tla')
  expect(ns.value).toBe('tla-value')
})

it('should return the deferred namespace of the requested module', async () => {
  const names = ['other']
  const ns = await import.defer(`./ctx/${names[0]}.js`)
  expect(log).not.toContain('other')
  expect(ns.value).toBe('other-value')
  expect(log).toContain('other')
})
