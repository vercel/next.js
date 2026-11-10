import './module?1'
import { getX, getY } from './module?2'
import { getX as getX2 } from './module?3'
import { getY as getY2 } from './module?4'

export function test() {
  expect(getX()).toBe(42)
  expect(getY()).toBe(42)
  expect(getX2()).toBe(42)
  expect(getY2()).toBe(42)
}
