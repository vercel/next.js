import './setup.js'

it('does not defer a module whose only deferrable import is in an unused export', async () => {
  // `later.js` reads `shared.js` at its top level. `helper.js` reads it only inside an export
  // that nothing uses, so that import is removed: nothing defers `shared.js`.
  //
  // No import of this test is deferred, so the runtime has no function for the factory of a
  // deferred module, and a factory that is marked as one throws when it runs.
  const later = await globalThis.deferRequest.run(
    'request 1',
    () => import('./later.js')
  )
  expect(globalThis.deferEvents).toEqual(['shared', 'helper', 'later'])
  // The three modules are evaluated in the async context of the import that loads them.
  expect(later.atEvaluation).toEqual(['request 1', 'request 1', 'request 1'])
})
