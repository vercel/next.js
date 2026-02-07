import { obj as obj2 } from './module'
export const obj = {
  func() {
    return this
  },
  test() {
    expect(obj2.func()).toBe(obj2)
  },
}
