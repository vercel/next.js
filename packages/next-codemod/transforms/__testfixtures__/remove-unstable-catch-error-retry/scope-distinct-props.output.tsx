// @ts-nocheck
/* eslint-disable */
'use client'

// Only the binding that also accesses `reset` is the error component.
export function ErrorComp(props) {
  return props.reset() || props.retry();
}

// A different `props` binding (no sibling `reset`) must be left untouched.
export function Other(props) {
  return props.unstable_retry()
}
