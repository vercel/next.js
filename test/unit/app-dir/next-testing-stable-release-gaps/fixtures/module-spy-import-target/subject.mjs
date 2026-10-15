globalThis.spyOrder.push('original')
await Promise.resolve()
export const evaluations = globalThis.spyOrder.length
export const primitive = 7
export const array = [1, 2, 3]
export function fn(value) {
  return value + 42
}
export const alias = fn
export default function defaultFn() {
  return 99
}
export let count = 0
export function inc() {
  return ++count
}
export class Box {
  constructor(value) {
    this.value = value
  }
  method() {
    return this.value
  }
}
export const nested = {
  fn,
  get secret() {
    return 5
  },
}
