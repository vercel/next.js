import * as ns from './enums'

// The whole namespace object escapes through a function return, so no static analysis can tell
// which names the caller will read.
export const getEnums = () => ns
