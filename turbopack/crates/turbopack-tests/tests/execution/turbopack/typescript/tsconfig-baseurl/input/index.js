import { globalFoo, localFoo, atFoo, bar } from './imports.ts'

it('resolves `paths` relative to `baseUrl` from tsconfig.json', () => {
  // All requests are mapped to `./prop.ts`
  expect(globalFoo).toBe(1)
  expect(localFoo).toBe(1)
  expect(atFoo).toBe(1)
})

it('resolves bare requests not in `paths` from node_modules instead of `baseUrl`', () => {
  // `bar` must not resolve to `./bar.json`
  expect({ ...bar }).toEqual({ bar: 'bar' })
})
