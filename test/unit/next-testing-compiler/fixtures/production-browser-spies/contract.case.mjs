import { beforeEach, expect, test, vi } from 'vitest'
import * as subject from './subject.mjs'
import { Counter, state, sum } from './subject.mjs'
import { factoryValue } from './factory.mjs'

vi.mock('./subject.mjs', { spy: true })
vi.mock('./factory.mjs', () => ({ factoryValue: vi.fn(() => 77) }))
beforeEach(() => vi.clearAllMocks())

test('keeps named and namespace spies on the same function', () => {
  expect(sum).toBe(subject.sum)
  expect(vi.isMockFunction(sum)).toBe(true)
  expect(sum(2, 3)).toBe(5)
  expect(sum).toHaveBeenCalledOnce()
  expect(subject.sum).toHaveBeenCalledWith(2, 3)
})

test('spies on class instances and nested object methods', () => {
  const counter = new Counter(4)
  expect(counter.read()).toBe(4)
  expect(Counter).toHaveBeenCalledOnce()
  expect(Counter.prototype.read).toHaveBeenCalledOnce()
  expect(state.nested.read(5)).toBe(6)
  expect(state.nested.read).toHaveBeenCalledWith(5)
})

test('composes explicit factory and original spies', () => {
  expect(factoryValue()).toBe(77)
  expect(factoryValue).toHaveBeenCalledOnce()
  expect(sum(10, 20)).toBe(30)
  expect(sum).toHaveBeenCalledOnce()
})
