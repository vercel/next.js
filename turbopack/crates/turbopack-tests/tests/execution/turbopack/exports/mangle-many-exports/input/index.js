import * as manyAsNamespace from './many'
import { values, exportsInfo as namedExportsInfo } from './consume'

// 60 used exports don't fit the 54 single-character identifiers, so the table grows to two
// characters.

it('should mangle a 60-export module into a two-character table', () => {
  const entries = Object.entries(namedExportsInfo)
  expect(entries.length).toBe(60)

  for (const [name, info] of entries) {
    expect(info.canMangle).toBe(true)
    expect(info.mangledName).not.toBe(name)
    expect(info.mangledName.length).toBeLessThanOrEqual(2)
  }

  // Every name gets a distinct key.
  const keys = entries.map(([, info]) => info.mangledName)
  expect(new Set(keys).size).toBe(60)

  // Some names still fit in one character: the table is only as long as it has to be, and open
  // addressing never pushes a name past the chosen length.
  expect(keys.some((key) => key.length === 1)).toBe(true)
})

it('should keep all 60 values correct through the mangled keys', () => {
  const expected = Array.from(
    { length: 60 },
    (_, i) => `value-${String(i).padStart(2, '0')}`
  )
  expect(values()).toEqual(expected)
})

it('should keep the names of a module read with a computed key', () => {
  for (let i = 0; i < 60; i++) {
    const n = String(i).padStart(2, '0')
    expect(manyAsNamespace[`exportNumber${n}`]).toBe(`value-${n}`)
  }
  expect(manyAsNamespace.exportsInfo.exportNumber00.canMangle).toBe(false)
})
