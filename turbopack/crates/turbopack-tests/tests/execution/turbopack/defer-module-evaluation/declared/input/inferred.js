// Nothing here has a side effect, and the imported module is declared side effect free. Its
// evaluation shows when this module is evaluated.
import { value } from './library/imported-by-inferred.js'

export const inferred = value
