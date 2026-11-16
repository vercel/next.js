export const strictC = (function () {
  return this
})()

export function callableC(...args) {
  return [this, args.length]
}
