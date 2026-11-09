import './setup.js'

it('should evaluate modules once and in import order when a registered function loads a collected module whose imports are being evaluated', async () => {
  // `holder.js` emits `entry.js` and registers a function that loads it from the collected
  // list.
  await import('./a.js')
  expect(globalThis.evaluationOrder).toEqual(['registry', 'holder', 'a'])

  // `shared1.js` calls that function while it is being evaluated, and no reference leads from
  // it to `holder.js`. `entry.js` imports `shared1.js` and `shared2.js`, like `b.js`.
  const { b } = await import('./b.js')
  expect(globalThis.evaluationOrder.slice(3)).toEqual([
    'shared1',
    'peer',
    'shared2',
    'entry',
    'b',
  ])
  expect(b()).toBe('shared1 shared2')

  // `entry.js` is the target of an `import()` and part of a cycle of imports with `peer.js`.
  await import('./entry.js')
  expect(globalThis.evaluationOrder.slice(8)).toEqual([])
})
