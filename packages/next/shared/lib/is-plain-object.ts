export function getObjectClassLabel(value: any): string {
  return Object.prototype.toString.call(value)
}

export function isPlainObject(value: any): boolean {
  if (getObjectClassLabel(value) !== '[object Object]') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}
