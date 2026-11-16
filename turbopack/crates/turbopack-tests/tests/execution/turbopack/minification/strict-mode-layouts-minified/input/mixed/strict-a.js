export const strictA = (function () {
  return this
})()

export function callableA(...args) {
  return [this, args.length]
}
