// This side effect should always be included
console.log('TREESHAKE_EMPTY_SIDE_EFFECT')

export function emptyUsed() {
  return 'TREESHAKE_EMPTY_USED'
}

export function emptyUnused() {
  return 'TREESHAKE_EMPTY_UNUSED'
}
