import chain from './chain.module.css'
import other from './other.module.css'
import localImport from './local-import.module.css'
import cross from './cross.module.css'
import cycleA from './cycle-a.module.css'
import cycleB from './cycle-b.module.css'
import moduleCycleA from './module-cycle-a.module.css'
import moduleCycleB from './module-cycle-b.module.css'
import selfCycle from './self-cycle.module.css'
import ordering from './ordering.module.css'

// The class name generated for `name` itself, without any composed classes.
function own(styles, name) {
  const value = styles[name]
  expect(typeof value).toBe('string')
  const first = value.split(' ')[0]
  expect(first).toMatch(new RegExp(`${name}$`))
  return first
}

function classes(styles, name) {
  return styles[name].split(' ')
}

it('expands local composes transitively', () => {
  expect(classes(chain, 'a')).toEqual([own(chain, 'a')])
  expect(classes(chain, 'b')).toEqual([own(chain, 'b'), own(chain, 'a')])
  expect(classes(chain, 'c')).toEqual([
    own(chain, 'c'),
    own(chain, 'b'),
    own(chain, 'a'),
  ])
})

it('expands imported classes reached through local composes', () => {
  expect(classes(localImport, 'middle')).toEqual([
    own(localImport, 'middle'),
    own(other, 'imported'),
    own(other, 'base'),
  ])
  expect(classes(localImport, 'outer')).toEqual([
    own(localImport, 'outer'),
    own(localImport, 'middle'),
    own(other, 'imported'),
    own(other, 'base'),
  ])
})

it('expands cross-file composes transitively', () => {
  expect(classes(cross, 'top')).toEqual([
    own(cross, 'top'),
    own(chain, 'c'),
    own(chain, 'b'),
    own(chain, 'a'),
  ])
})

it('breaks cross-file class cycles without a runtime error', () => {
  expect(classes(cycleA, 'cyc')).toEqual([
    own(cycleA, 'cyc'),
    own(cycleB, 'back'),
  ])
  expect(classes(cycleB, 'back')).toEqual([
    own(cycleB, 'back'),
    own(cycleA, 'cyc'),
  ])
})

it('flattens module cycles that have no class cycle', () => {
  expect(classes(moduleCycleA, 'x')).toEqual([
    own(moduleCycleA, 'x'),
    own(moduleCycleB, 'y'),
  ])
  expect(classes(moduleCycleB, 'z')).toEqual([
    own(moduleCycleB, 'z'),
    own(moduleCycleA, 'w'),
  ])
})

it('breaks same-file class cycles', () => {
  expect(classes(selfCycle, 'p')).toEqual([
    own(selfCycle, 'p'),
    own(selfCycle, 'q'),
  ])
  expect(classes(selfCycle, 'q')).toEqual([
    own(selfCycle, 'q'),
    own(selfCycle, 'p'),
  ])
})

it('keeps pre-order for every root of a class cycle', () => {
  expect(classes(ordering, 'a')).toEqual([
    own(ordering, 'a'),
    own(ordering, 'b'),
    own(ordering, 'd'),
    own(ordering, 'e'),
  ])
  expect(classes(ordering, 'b')).toEqual([
    own(ordering, 'b'),
    own(ordering, 'a'),
    own(ordering, 'e'),
    own(ordering, 'd'),
  ])
})

it('dedupes diamonds and keeps global names', () => {
  expect(classes(ordering, 'diamond')).toEqual([
    own(ordering, 'diamond'),
    own(ordering, 'left'),
    own(ordering, 'shared'),
    own(ordering, 'right'),
    'global-name',
  ])
})
