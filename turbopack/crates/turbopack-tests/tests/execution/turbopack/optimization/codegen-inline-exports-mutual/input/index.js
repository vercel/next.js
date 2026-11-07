import { readB } from './a'
import { readA } from './b'

it('supports two retained modules importing constants from each other', () => {
  expect(readB()).toBe('b')
  expect(readA()).toBe('a')
  expect(globalThis.mutualAEvaluations).toBe(1)
  expect(globalThis.mutualBEvaluations).toBe(1)

  expect(readB.toString()).toContain('"b"')
  expect(readB.toString()).not.toContain('bValue')
  expect(readA.toString()).toContain('"a"')
  expect(readA.toString()).not.toContain('aValue')

  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).toContainEqual(expect.stringMatching(/input\/a\.js/))
  expect(modules).toContainEqual(expect.stringMatching(/input\/b\.js/))
})
