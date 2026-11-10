import * as ns from './cjs'

// A CommonJS namespace escaping through the interop layer. CommonJS exports are never mangled,
// and the interop object must keep working unchanged.
export const getCjs = () => ns
