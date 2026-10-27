import { getValue, increment, setValue } from './state.js'
import { readCycle } from './cycle-a.js'
import { firstValue } from './first.js'
import { secondValue } from './second.js'
import { order } from './order.js'
import './order-entry.js'
import {
  value as forwardedValue,
  setValue as forwardedSetValue,
} from './barrel.js'
import * as stateNamespace from './barrel.js'

it('preserves live bindings across merged parts', () => {
  expect(Array.from(__turbopack_modules__.keys())).not.toContainEqual(
    expect.stringMatching(/mergeable-parts\/input\/state\.js.*internal part/)
  )
  expect(getValue()).toBe(0)
  increment()
  expect(getValue()).toBe(1)
  setValue(42)
  expect(getValue()).toBe(42)
  expect(forwardedValue).toBe(42)
  forwardedSetValue(7)
  expect(forwardedValue).toBe(7)
  expect(stateNamespace.value).toBe(7)
  expect(Object.getOwnPropertyDescriptor(stateNamespace, 'value').set).toBe(
    undefined
  )
  expect(getValue()).toBe(7)
})

it('keeps syntax contexts separate', () => {
  expect(firstValue()).toBe('first')
  expect(secondValue()).toBe('second')
})

it('preserves cycles and evaluation order', () => {
  expect(readCycle()).toBe('ab')
  expect(order).toEqual(['dependency', 'entry'])
})
