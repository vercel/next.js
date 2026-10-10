import * as ns from './enums'

// The namespace object escapes, so it cannot be statically tracked.
export const getEnums = () => ns
