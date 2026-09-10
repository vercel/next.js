const value = 'comma-value'
const plain = 'plain-value'

// An export name containing a comma cannot be recovered by splitting the
// compact single-string spelling, so this forces the pair encoding.
export { value as 'has,comma', plain }
