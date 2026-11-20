import { bar } from 'bar'
import './shared'

it('loads an async chunk sharing modules with the parent chunk', async () => {
  expect(bar(true)).toBe(true)

  const { foo, bar: asyncBar } = await import('./import')
  expect(foo(true)).toBe(true)
  // Modules available in the parent chunk are reused, not duplicated.
  expect(asyncBar).toBe(bar)
  expect(globalThis.sharedEvaluations).toEqual(['shared'])
})
