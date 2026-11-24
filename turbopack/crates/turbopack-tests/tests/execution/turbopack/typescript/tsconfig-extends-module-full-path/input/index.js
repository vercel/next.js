import { globalFoo, localFoo, atFoo } from './imports.ts'

// The package uses `.js` files as TypeScript in node_modules isn't transformed
// in execution tests.
it('resolves `paths` from a tsconfig.json extended via a full path into a package', () => {
  // `tsconfig-mod/tsconfig.json` maps all requests to
  // `node_modules/tsconfig-mod/prop.js`
  expect(globalFoo).toBe(1)
  expect(localFoo).toBe(1)
  expect(atFoo).toBe(1)
})
