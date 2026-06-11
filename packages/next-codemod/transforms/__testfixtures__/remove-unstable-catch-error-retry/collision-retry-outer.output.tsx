// @ts-nocheck
/* eslint-disable */
'use client'

// A pre-existing `retry` helper must keep working after the migration.
function retry() {
  return 'helper'
}

export default function Error({ error, reset, retry: unstable_retry }) {
  retry()
  return unstable_retry()
}
