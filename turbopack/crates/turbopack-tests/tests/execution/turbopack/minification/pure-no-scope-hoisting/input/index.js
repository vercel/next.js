import annotatedDefault, {
  annotated,
  annotatedDeclaration,
  exportedLater,
  getState,
  unannotated,
} from '../../pure/input/library'
import { reexported } from '../../pure/input/reexport'
import { annotated as starReexported } from '../../pure/input/star'
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

const parenthesizedAlias = annotated
parenthesizedAlias()

let argumentState = 0
annotated(argumentState++)
annotated`tagged${argumentState++}`

unannotated()
unannotated`tagged`

it('should propagate NO_SIDE_EFFECTS without scope hoisting', () => {
  expect(getState()).toBe(2)
  expect(argumentState).toBe(2)
})
