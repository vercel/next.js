import { test, expect, vi as vitest } from 'vitest'
import { read } from './subject.mjs'

const { readSpy, marker } = vitest.hoisted(() => ({
  readSpy: vitest.fn(() => 42),
  marker: {},
}))

vitest.mock('./subject.mjs', () => ({ read: readSpy }))

test('aliased vi shares a destructured hoisted spy with its factory', () => {
  expect(read).toBe(readSpy)
  expect(read()).toBe(42)
  expect(readSpy).toHaveBeenCalledExactlyOnceWith()
  expect(marker).toEqual({})
})
