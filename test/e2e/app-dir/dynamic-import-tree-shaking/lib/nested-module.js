export const nested = {
  inner: 'TREESHAKE_NESTED_USED',
}

export function nestedUnused() {
  return 'TREESHAKE_NESTED_UNUSED'
}
