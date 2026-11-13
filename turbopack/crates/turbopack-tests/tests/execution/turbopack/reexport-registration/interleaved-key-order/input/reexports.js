// Sorting the keys interleaves the sources: `a` and `d` come from `first`, `b` from `second`, and
// `c` from `third`. U+1F600 is a surrogate pair (0xD83D 0xDE00) in UTF-16, so it sorts before
// U+FF61 in code unit order, even though its UTF-8 bytes sort after.
export { a, d, '😀' } from './first'
export { b, '｡' } from './second'
export { c } from './third'
