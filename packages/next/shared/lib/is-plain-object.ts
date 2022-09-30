export function getObjectClassLabel(value: any): string {
  return Object.prototype.toString.call(value)
}

export function isPlainObject(value: any): boolean {
  if (getObjectClassLabel(value) !== '[object Object]') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)

  /**
   * this used to be previously:
   *
   * `return prototype === null || prototype === Object.prototype`
   *
   * but Edge Runtime expose Object from vm, being that kind of type-checking wrongly fail.
   *
   * It was changed to the current implementation since it's resilient to serialization.
   */
  return prototype === null || prototype.hasOwnProperty('isPrototypeOf')
}
