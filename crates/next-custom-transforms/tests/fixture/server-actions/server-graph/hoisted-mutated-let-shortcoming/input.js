// Known shortcoming: when a hoisted `"use cache"` or `"use server"` function
// declaration closes over a `let` variable that is declared before the
// function's first use and mutated *after* that first use, the compiler hoists
// `$$RSC_SERVER_...bind(null, encryptActionBoundArgs(..., value))` right before
// the first use.
//
// Because `encryptActionBoundArgs` evaluates eagerly at the hoisted site rather
// than lazily when the function is called or serialized by React, both
// `readValue` and `readCached` capture `'initial'` instead of `'updated'`.
export function mutatedLetShortcoming() {
  let value = 'initial'
  const actionRef = readValue
  const cacheRef = readCached
  value = 'updated'

  return [actionRef, cacheRef]

  async function readValue() {
    'use server'

    return value
  }

  async function readCached() {
    'use cache'

    return value
  }
}
