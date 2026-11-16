export const strictB = (function () {
  return this
})()

export function callableB(...args) {
  return [this, args.length]
}
