export const SOME_VALUE = 'x'

import { IMPORTED_EXPORTED } from './third'
export { IMPORTED_EXPORTED }
export { REEXPORTED } from './third'

export const USING_IMPORTED_EXPORTED = 'x' + IMPORTED_EXPORTED
