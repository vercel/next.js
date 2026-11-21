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

annotated()()
annotated().authorize()
annotated()`outer tag`
annotated`inner tag`()
annotated`inner tag``outer tag`
namespace.annotated()()
// prettier-ignore
const unusedWrappedInvocation = (annotated())`parenthesized invocation`
annotated()?.()
new (annotated())()

unannotated()
unannotated`tagged`
