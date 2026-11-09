import './setup.js'

it('does not defer a module whose only deferrable import is in a module imported for its side effect', async () => {
  // `later.js` reads `free.js` at its top level and imports `effect.js` for its side effect.
  // `effect.js` reads `free.js` only inside an export that nothing uses, so that import is
  // removed: nothing defers `free.js`.
  //
  // No import of this test is deferred, so the runtime has no function for the factory of a
  // deferred module, and a factory that is marked as one throws when it runs.
  const later = await globalThis.deferRequest.run(
    'request 1',
    () => import('./later.js')
  )
  expect(globalThis.deferEvents).toEqual(['free', 'effect', 'later'])
  // The modules are evaluated in the async context of the import that loads them.
  expect(later.atEvaluation).toEqual(['request 1', 'request 1'])
})
