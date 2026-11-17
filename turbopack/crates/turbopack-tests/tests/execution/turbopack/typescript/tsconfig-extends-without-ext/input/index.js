import { globalFoo, localFoo, atFoo } from './imports.ts'

it('resolves `paths` from an extended tsconfig.json', () => {
  // All requests are mapped to `./prop.ts`
  expect(globalFoo).toBe(1)
  expect(localFoo).toBe(1)
  expect(atFoo).toBe(1)
})
