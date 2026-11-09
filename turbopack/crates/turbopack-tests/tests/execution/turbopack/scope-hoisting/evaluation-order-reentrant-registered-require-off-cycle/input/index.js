import './setup.js'

it('should evaluate modules once and in import order when a registered function requires a module that imports only the modules below a cycle', async () => {
  // `holder.js` registers a function that requires `beside.js`, which imports `shared1.js` and
  // `shared2.js` and no module of the cycle.
  await import('./a.js')
  expect(globalThis.evaluationOrder).toEqual(['registry', 'holder', 'a'])

  // `shared1.js` calls that function while it is being evaluated, and no reference leads from
  // it to `holder.js`. `b.js` imports `shared1.js` and `shared2.js` too.
  const { b } = await import('./b.js')
  expect(globalThis.evaluationOrder.slice(3)).toEqual([
    'shared1',
    'shared2',
    'beside',
    'b',
  ])
  expect(b()).toBe('shared1 shared2')

  // `entry.js` imports both as well. It is the target of an `import()` and part of a cycle of
  // imports with `peer.js`. It is the only entry on a cycle, and the function does not load it.
  await import('./entry.js')
  expect(globalThis.evaluationOrder.slice(7)).toEqual(['peer', 'entry'])
})
