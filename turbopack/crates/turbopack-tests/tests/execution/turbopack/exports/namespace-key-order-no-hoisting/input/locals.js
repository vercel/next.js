// Declared out of code unit order. U+1F600 is a surrogate pair (0xD83D 0xDE00) in UTF-16, so it
// sorts before U+FF61 in code unit order, even though its UTF-8 bytes sort after.
const grinning = 'grinning-value'
const halfwidthStop = 'halfwidth-stop-value'
export { halfwidthStop as '｡', grinning as '😀' }
export let mutable = 'mutable-value'
export function b() {
  return 'b-value'
}
export const a = 'a-value'
export default 'default-value'
