import './deferred.js'
import './invoked.js'

it('drops deferred function data but retains invoked callback effects', () => {
  expect(globalThis.invokedCallback).toBe('executed')
  expect(globalThis.deferredCallback).toBeUndefined()
  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/deferred\.js/)
  )
  expect(modules).toContainEqual(expect.stringMatching(/input\/invoked\.js/))
})
