const toString = Object.prototype.toString

export function isObject(thing: unknown): thing is Record<string, any> {
  return toString.call(thing) === '[object Object]'
}
