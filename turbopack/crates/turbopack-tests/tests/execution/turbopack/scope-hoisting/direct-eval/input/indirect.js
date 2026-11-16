const local = 'indirect'

// None of these are direct evals, so this module can still be merged.
export const indirect = [
  (0, eval)('1'),
  globalThis.eval('2'),
  eval?.('3'),
  local,
]
