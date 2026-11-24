import { globalFoo, localFoo, atFoo } from './imports.ts'

it('resolves `paths` from a tsconfig.json extended via a relative directory', () => {
  // `config/ts/tsconfig.json` extends `..` (`config/tsconfig.json`), whose
  // `baseUrl` maps all requests to `./prop.ts`
  expect(globalFoo).toBe(1)
  expect(localFoo).toBe(1)
  expect(atFoo).toBe(1)
})
