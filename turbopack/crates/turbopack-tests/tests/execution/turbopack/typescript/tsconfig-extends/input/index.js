import { globalFoo, localFoo, atFoo } from './imports.ts'

it('resolves `paths` from a tsconfig.json extended without the .json extension', () => {
  // All requests are mapped to `./prop.ts`
  expect(globalFoo).toBe(1)
  expect(localFoo).toBe(1)
  expect(atFoo).toBe(1)
})
