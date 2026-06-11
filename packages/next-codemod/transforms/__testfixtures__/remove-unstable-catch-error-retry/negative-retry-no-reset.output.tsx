// @ts-nocheck
/* eslint-disable */
// Destructure without the sibling `reset` prop: not the error component shape.
export function widget({ unstable_retry }) {
  return unstable_retry()
}

// Plain (non-destructured) parameter named unstable_retry is left untouched too.
export function compute(unstable_retry) {
  return unstable_retry(5)
}
