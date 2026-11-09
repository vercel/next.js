import './setup.js'

it('does not defer a module whose only deferrable import is in a module that is removed', async () => {
  // `later.js` reads `free.js` at its top level. `removed.js` reads it only inside a function,
  // but nothing uses `removed.js`, so no code is generated for it: nothing defers `free.js`.
  const later = await globalThis.deferRequest.run(
    'request 1',
    () => import('./later.js')
  )
  expect(globalThis.deferEvents).toEqual(['free', 'later'])
  // The factory of a deferred module runs outside the async context of what evaluates it first.
  // These modules are evaluated in the async context of the import that loads them.
  expect(later.atEvaluation).toEqual(['request 1', 'request 1'])
})
