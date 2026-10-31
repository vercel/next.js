import { lightweight } from './a.js'

it('removes the dependency when the wrapper creation is annotated as pure', () => {
  expect(lightweight()).toBe('lightweight')
  expect(globalThis.pureHoistedWrapperDependencyBundled).toBeUndefined()
})
