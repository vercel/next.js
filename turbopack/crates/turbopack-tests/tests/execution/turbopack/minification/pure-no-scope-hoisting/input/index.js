import annotatedDefault, {
  annotated,
  annotatedDeclaration,
  exportedLater,
  getState,
  factory,
  unannotated,
} from '../../pure/input/library'
import { reexported, reexportedFactory } from '../../pure/input/reexport'
import {
  annotated as starReexported,
  factory as starFactory,
} from '../../pure/input/star'
import * as directNamespace from '../../pure/input/library'
import { namespace } from '../../pure/input/namespace-reexport'

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

it('should propagate NO_SIDE_EFFECTS without scope hoisting', () => {
  expect(getState()).toBe(2)
  expect(argumentState).toBe(2)
})
