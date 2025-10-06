import { Parent } from './ui/src/index'

it('should retain side effect-full imports', () => {
  expect(Parent()).toBe('Parent Child')
  expect(globalThis.sideEffectExecuted).toBe(true)
})
