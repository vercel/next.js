import './setup.js'

it('should not merge a module of an import cycle with a module that another module reads through it', async () => {
  // `a.js` imports `reader.js` and then `x.js`. `reader.js` calls a function of `a.js` that
  // returns `x` while `a.js` is being evaluated: the import of `x.js` has not run yet. In one
  // scope with `x.js`, the function would read the binding itself before it is initialized.
  await import('./a.js')
  expect(globalThis.evaluationOrder).toEqual(['reader', 'x', 'a'])
  expect(globalThis.seenByReader).toBe('TypeError')

  // `t.js` imports `a.js` and `x.js` too, and `reader.js` is the target of an `import()`: an
  // entry that is part of a cycle of imports.
  const { t } = await import('./t.js')
  expect(t).toBe('x x')
  await import('./reader.js')
  expect(globalThis.evaluationOrder.slice(3)).toEqual(['t'])
})
