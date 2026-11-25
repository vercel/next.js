import {
  toString,
  valueOf,
  constructor,
  __proto__,
  a,
  $1,
  __1,
  aVeryLongExportNameIndeed,
  exportsInfo,
} from './lib'

it('should mangle exports whose names shadow Object.prototype members', () => {
  expect(toString).toBe('toString-value')
  expect(valueOf).toBe('valueOf-value')
  expect(constructor).toBe('constructor-value')
  expect(__proto__).toBe('proto-value')
  expect(aVeryLongExportNameIndeed).toBe('long')
})

it('should keep short names and mangle the rest', () => {
  expect(a).toBe('single char')
  expect($1).toBe('double char')
  expect(__1).toBe('3 chars')

  // `a` and `$` are single valid identifiers in the table's alphabet, so they keep themselves.
  expect(exportsInfo.a.mangledName).toBe('a')
  // `$1` and `__1` are longer than the table's identifier length, so they get hashed like any
  // other name — including `__1`, which is not even representable in the encoding (trailing
  // "zero" characters are rejected as degenerate).
  expect(exportsInfo.$1.mangledName).not.toBe('$1')
  expect(exportsInfo.__1.mangledName).not.toBe('__1')
})

it('should give every export a distinct key', () => {
  const keys = Object.values(exportsInfo).map((e) => e.mangledName)
  expect(new Set(keys).size).toBe(keys.length)
})
