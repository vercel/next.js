import annotatedDefault, {
  annotated,
  annotatedDeclaration,
  exportedLater,
  getState,
  unannotated,
} from './library'
import { reexported } from './reexport'
import { annotated as starReexported } from './star'
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

it('should remove unused PURE statements', () => {
  expect(state).toBe(0)
})

it('should propagate NO_SIDE_EFFECTS across imports and reexports', () => {
  expect(getState()).toBe(2)
  expect(argumentState).toBe(2)
})
