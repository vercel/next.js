// @ts-nocheck
/* eslint-disable */
// An object literal / member access with no sibling `reset` is not error props.
const config = { unstable_retry: true }

export function getRetry() {
  return config.unstable_retry
}
