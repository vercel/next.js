import { annotated, unannotated } from './library'
import { namespace } from './namespace-reexport'

annotated()
annotated`tagged`
namespace.annotated()

const alias = annotated
alias()

// prettier-ignore
const parenthesizedAlias = (annotated)
parenthesizedAlias()

unannotated()
unannotated`tagged`
