import annotatedDefault, {
  annotated,
  annotatedDeclaration,
  exportedLater,
  getState,
  unannotated,
} from './library'
import { reexported } from './reexport'
import { annotated as starReexported } from './star'

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

const alias = annotated
alias()

let argumentState = 0
annotated(argumentState++)

unannotated()

it('should remove unused PURE statements', () => {
  expect(state).toBe(0)
})

it('should propagate NO_SIDE_EFFECTS across imports and reexports', () => {
  expect(getState()).toBe(1)
  expect(argumentState).toBe(1)
})
