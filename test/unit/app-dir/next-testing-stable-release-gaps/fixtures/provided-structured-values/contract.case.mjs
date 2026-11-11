import { test, expect, inject } from 'vitest'
test('provided values survive worker transport', () => {
  expect(inject('date')).toBeInstanceOf(Date)
  expect(inject('date').toISOString()).toBe('2026-01-02T03:04:05.000Z')
  expect(inject('map')).toBeInstanceOf(Map)
  expect(inject('map').get('key')).toBe(42)
  expect(inject('big')).toBe(42n)
})
