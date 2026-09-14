import * as m from './module-esm-used'

// Calling a namespace method passes the exports object as `this`
export const result = m.sign('/esm')
