// Known shortcoming: the compiler errors when a hoisted `"use cache"` or
// `"use server"` function declaration captures a binding that is directly
// reassigned after the first use (`value = 'updated'`, `id1++`), but it does
// not detect in-place mutations of captured objects or arrays (`state.value = ...`,
// `items.push(...)`).
//
// Because `encryptActionBoundArgs` is hoisted right before the first use and
// serializes captured values eagerly, `readState` captures `state.value` as
// `'initial'` (missing `state.value = 'updated'`) and `readItems` serializes
// `items` as `['initial']` (missing `items.push('updated')`).
export function innerMutationShortcoming() {
  const state = { value: 'initial' }
  const items = ['initial']
  const actionRef = readState
  const cacheRef = readItems
  state.value = 'updated'
  items.push('updated')

  return [actionRef, cacheRef]

  async function readState() {
    'use server'

    return state.value
  }

  async function readItems() {
    'use cache'

    return items
  }
}
