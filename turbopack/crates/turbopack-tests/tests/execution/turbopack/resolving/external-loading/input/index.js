it('should require a supported CommonJS external', () => {
  const { AsyncLocalStorage } = require('async_hooks')
  expect(typeof AsyncLocalStorage).toBe('function')
})

it('should dynamically import a supported Node.js external', async () => {
  const promise = import('node:async_hooks')
  expect(promise).toBeInstanceOf(Promise)
  const { AsyncLocalStorage } = await promise
  expect(typeof AsyncLocalStorage).toBe('function')
})

it('should resolve an external id without loading it', () => {
  expect(require.resolve('node:async_hooks')).toBe(
    '[externals]/node:async_hooks [external] (node:async_hooks, cjs)'
  )
})
