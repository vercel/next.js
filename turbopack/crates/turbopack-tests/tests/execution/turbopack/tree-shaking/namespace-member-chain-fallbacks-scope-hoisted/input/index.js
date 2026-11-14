import * as computed from './f1-lib'
import * as escaping from './f2-lib'
import * as mixed from './f3-lib'
import * as receiver from './f4-lib'
import * as directReceiverA from './f4-a'
import * as directReceiverB from './f4-b'
import * as identity from './f5-lib'
import * as directIdentity from './f5-a'
import * as optional from './f6-lib'
import * as live from './f7-lib'
import * as topLevelAwait from './f8-lib'
import * as once from './f9-lib'
import { a as onceA } from './f9-lib'
import * as methodCall from './f10-lib'
import * as optionalCall from './f11-lib'
import * as taggedTemplate from './f12-lib'
import { a as namedMethodCall } from './f13-lib'
import * as parenthesizedCall from './f14-lib'
import * as indirectCall from './f15-lib'

function opaque(value) {
  return value
}

it('keeps the whole namespace at the level of a computed access', () => {
  const key = ['sib', 'ling'].join('')
  expect(computed.a.b[key]).toBe('sibling')
  expect(computed.a.b.siblingUsed).toBe(true)
  expect(computed.a.aUnusedInfo).toBe(false)
})

it('keeps the whole namespace at the level where it escapes', () => {
  const escaped = opaque(escaping.a.b)
  expect(escaped.sibling).toBe('sibling')
  expect(escaping.a.b.siblingUsed).toBe(true)
  expect(escaping.a.aUnusedInfo).toBe(false)
})

it('lets an opaque use win over static reads at the same level only', () => {
  expect(mixed.a.b.c.leaf).toBe('leaf')
  expect(opaque(mixed.a.b.c).sibling).toBe('sibling')
  expect(mixed.a.b.c.siblingUsed).toBe(true)
  expect(mixed.a.b.bUnusedInfo).toBe(false)
})

it('keeps the namespace object as the receiver of a method call', () => {
  expect(receiver.a.self()).toBe(directReceiverA)
  expect(receiver.a.b.self()).toBe(directReceiverB)
})

it('keeps the whole receiver of a nested method call', () => {
  // `marker` is only read through `this`.
  expect(methodCall.a.b.readMarker()).toBe('marker-10')
  // Levels above the receiver are still narrowed.
  expect(methodCall.a.aUnusedInfo).toBe(false)
})

it('keeps the whole receiver of a nested optional method call', () => {
  expect(optionalCall.a.b.readMarker?.()).toBe('marker-11')
  expect(optionalCall.a.aUnusedInfo).toBe(false)
})

it('keeps the whole receiver of a nested tagged template', () => {
  expect(taggedTemplate.a.b.tag`template`).toBe('marker-12')
  expect(taggedTemplate.a.aUnusedInfo).toBe(false)
})

it('keeps the whole receiver of a method call on a namespace-valued named import', () => {
  expect(namedMethodCall.b.readMarker()).toBe('marker-13')
  expect(namedMethodCall.aUnusedInfo).toBe(false)
})

it('keeps the whole receiver of a parenthesized nested method call', () => {
  // prettier-ignore
  expect((parenthesizedCall.a.b.readMarker)()).toBe('marker-14')
  expect(parenthesizedCall.a.aUnusedInfo).toBe(false)
})

it('still narrows an indirect call, which has no receiver', () => {
  expect((0, indirectCall.a.b.readReceiver)()).toBe('no-receiver')
  expect(indirectCall.a.b.markerUsed).toBe(false)
})

it('keeps namespace object identity', () => {
  expect(identity.a).toBe(directIdentity)
  expect(identity.a.leaf).toBe('leaf')
})

it('falls back for optional chaining without breaking runtime behavior', () => {
  expect(optional.a?.leaf).toBe('leaf')
  expect(optional.a.b?.leaf).toBe('leaf')
})

it('keeps live bindings live through nested namespaces', () => {
  expect(live.a.b.count).toBe(0)
  live.a.b.increment()
  expect(live.a.b.count).toBe(1)
})

it('supports top-level await in a nested namespace target', () => {
  expect(topLevelAwait.a.b.value).toBe('top-level-await')
})

it('evaluates a nested namespace target once', () => {
  expect(once.a.b.value).toBe('evaluated')
  expect(onceA.b.value).toBe('evaluated')
  expect(globalThis.namespaceMemberChainEvaluations).toBe(1)
})
