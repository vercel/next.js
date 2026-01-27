// Simple module with only local exports
// These export names may be internally shortened/mangled

export const a = 'short-a'
export const b = 'short-b'
export const foo = 'short-foo'
export const reallyLongExportName = 'long-name-1'
export const anotherVeryLongExportName = 'long-name-2'

export function shortFn() {
  return 'short-fn'
}

export function thisIsAVeryLongFunctionName() {
  return 'long-fn'
}
