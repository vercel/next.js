import './module-unused'
import { NativeClass, TranspiledClass } from './module-used'

export function test() {
  expect(NativeClass.f()).toBe(42)
  expect(TranspiledClass.f()).toBe(42)
}
