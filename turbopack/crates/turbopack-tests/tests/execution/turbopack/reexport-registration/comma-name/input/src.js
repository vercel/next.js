import { order } from './order'

order.push('src')

const value = 'comma-value'
const plain = 'plain-value'

// An export name containing a comma cannot be spelled in the compact
// comma-joined form, so this forces the pair encoding.
export { value as 'has,comma', plain }
