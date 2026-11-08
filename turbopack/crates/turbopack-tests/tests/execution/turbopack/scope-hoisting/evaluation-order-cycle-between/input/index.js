import './setup.js'

it('should evaluate modules in import order when a module between them is imported again while it is evaluated', async () => {
  const { a } = await import('./a.js')
  expect(globalThis.evaluationOrder).toEqual([
    'base',
    'left',
    'right',
    'barrel',
    'cycle',
    'outer',
    'a',
  ])
  expect(a.v()).toBe('cycle barrel')

  const { b } = await import('./b.js')
  expect(b.v()).toBe('cycle barrel')
  expect(globalThis.evaluationOrder.slice(7)).toEqual(['b'])
})
