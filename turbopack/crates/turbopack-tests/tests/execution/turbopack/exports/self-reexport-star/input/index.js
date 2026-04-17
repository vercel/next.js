import { Data, foo, bar, fooViaSelf, barViaSelf, nestedSelfFoo } from './data'
import * as DataNs from './data'
import {
  Data as ChainedData,
  foo as chainedFoo,
  bar as chainedBar,
} from './reexport'

it('should re-export own namespace correctly', () => {
  expect(Data.foo()).toBe('foo')
  expect(Data.bar()).toBe('bar')
})

it('should expose named exports alongside the self-namespace', () => {
  expect(foo()).toBe('foo')
  expect(bar()).toBe('bar')
})

it('should allow using the self-namespace from inside the module', () => {
  expect(fooViaSelf()).toBe('foo')
  expect(barViaSelf()).toBe('bar')
  expect(nestedSelfFoo()).toBe('foo')
})

it('should let the self-namespace reference itself recursively', () => {
  expect(Data.Data.foo()).toBe('foo')
  expect(Data.Data.Data.bar()).toBe('bar')
})

it('should expose the same self-namespace via a star-namespace import', () => {
  expect(DataNs.Data).toBe(Data)
  expect(DataNs.Data.foo).toBe(foo)
})

it('should re-export the self-namespace through a chained module', () => {
  expect(ChainedData).toBe(Data)
  expect(ChainedData.foo()).toBe('foo')
  expect(ChainedData.bar()).toBe('bar')
  expect(chainedFoo).toBe(foo)
  expect(chainedBar).toBe(bar)
})

it('should enumerate all expected keys on the self-namespace', () => {
  expect(Object.keys(Data).sort()).toEqual(
    ['Data', 'bar', 'barViaSelf', 'foo', 'fooViaSelf', 'nestedSelfFoo'].sort()
  )
})
