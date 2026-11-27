import * as asyncHooks from 'node:async_hooks'
import * as fs from 'node:fs'

async function loadPrefixed(useAsyncHooks) {
  let request
  if (useAsyncHooks) request = 'node:async_hooks'
  else request = 'node:fs'
  return {
    required: require(request),
    imported: await import(request),
    resolved: require.resolve(request),
  }
}

async function loadBare(useAsyncHooks) {
  let request
  if (useAsyncHooks) request = 'async_hooks'
  else request = 'fs'
  return {
    required: require(request),
    imported: await import(request),
    resolved: require.resolve(request),
  }
}

async function loadMixed(useBuiltin) {
  let request
  if (useBuiltin) request = 'node:fs'
  else request = './local.js'
  return {
    required: require(request),
    imported: await import(request),
    resolved: require.resolve(request),
  }
}

it('loads node:-prefixed builtin alternatives', async () => {
  const hooks = await loadPrefixed(true)
  expect(hooks.required.AsyncLocalStorage).toBe(asyncHooks.AsyncLocalStorage)
  expect(hooks.imported.default).toBe(hooks.required)
  expect(hooks.resolved).toBe(require.resolve('node:async_hooks'))

  const file = await loadPrefixed(false)
  expect(file.required.readFileSync).toBe(fs.readFileSync)
  expect(file.imported.default).toBe(file.required)
  expect(file.resolved).toBe(require.resolve('node:fs'))
})

it('loads bare builtin alternatives', async () => {
  const hooks = await loadBare(true)
  expect(hooks.required.AsyncLocalStorage).toBe(asyncHooks.AsyncLocalStorage)
  expect(hooks.imported.default).toBe(hooks.required)
  expect(hooks.resolved).toBe(require.resolve('async_hooks'))

  const file = await loadBare(false)
  expect(file.required.readFileSync).toBe(fs.readFileSync)
  expect(file.imported.default).toBe(file.required)
  expect(file.resolved).toBe(require.resolve('fs'))
})

it('loads mixed builtin and local alternatives', async () => {
  const builtin = await loadMixed(true)
  expect(builtin.required.readFileSync).toBe(fs.readFileSync)
  expect(builtin.imported.default).toBe(builtin.required)
  expect(builtin.resolved).toBe(require.resolve('node:fs'))

  const local = await loadMixed(false)
  expect(local.required.value).toBe('local')
  expect(local.imported.value).toBe('local')
  expect(local.resolved).toBe(require.resolve('./local.js'))
})
