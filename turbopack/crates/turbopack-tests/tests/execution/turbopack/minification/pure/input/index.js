import annotatedDefault, {
  annotated,
  annotatedDeclaration,
  exportedLater,
  getState,
  factory,
  unannotated,
} from './library'
import { reexported, reexportedFactory } from './reexport'
import { annotated as starReexported, factory as starFactory } from './star'
import * as directNamespace from './library'
import { namespace } from './namespace-reexport'

let state = 0

const unused = /*@__PURE__*/ (() => {
  state++
})()

annotated()
annotatedDeclaration()
annotatedDefault()
exportedLater()
reexported()
starReexported()
directNamespace.annotated()
namespace.annotated()
annotated`tagged`

const alias = annotated
alias()

// prettier-ignore
const parenthesizedAlias = (annotated)
parenthesizedAlias()

let argumentState = 0
annotated(argumentState++)
annotated`tagged${argumentState++}`

unannotated()
unannotated`tagged`

it('should preserve effectful calls chained after annotated factories', () => {
  const events = []
  let argumentsEvaluated = 0
  factory((argumentsEvaluated++, events))()
  factory(events)`outer tag${argumentsEvaluated++}`
  factory`inner tag${events}`()
  factory`inner tag${events}``outer tag`
  directNamespace.factory(events)()
  namespace.factory(events)()
  const alias = factory
  alias(events)()
  reexportedFactory(events)`outer tag`
  starFactory(events)()
  // prettier-ignore
  const unusedWrappedBinding = ((factory))(events)`parenthesized binding`
  // prettier-ignore
  const unusedWrappedInvocation = (factory(events))`parenthesized invocation`
  factory(events)?.()
  new (factory(events))()
  expect(events).toEqual(Array(13).fill('called'))
  expect(argumentsEvaluated).toBe(2)
})

it('should preserve a throwing method on an annotated factory result', () => {
  let protectedOperation = false
  try {
    factory([]).authorize()
    protectedOperation = true
  } catch (error) {
    expect(error.message).toBe('denied')
  }
  expect(protectedOperation).toBe(false)
})

it('should remove unused PURE statements', () => {
  expect(state).toBe(0)
})

it('should propagate NO_SIDE_EFFECTS across imports and reexports', () => {
  expect(getState()).toBe(2)
  expect(argumentState).toBe(2)
})
