globalThis.autoMockOrder.push('original')
await Promise.resolve()
export const primitive = 7
export const array = [1, 2, 3]
export function fn(value) {
  return value + 42
}
export const alias = fn
export default function defaultFn() {
  return 99
}
export class Box {
  method() {
    return 10
  }
}
export const shared = { value: 5 }
shared.self = shared
export const nested = {
  shared,
  fn,
  get secret() {
    return 5
  },
}
