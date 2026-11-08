// Nothing here has a side effect, but the imported module has one.
import { value } from './effect-of-inferred.js'

export const inferredImportsEffect = value
