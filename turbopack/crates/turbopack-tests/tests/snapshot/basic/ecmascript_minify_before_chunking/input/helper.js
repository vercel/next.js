export function double(value) {
  const doubled = value * 2
  return doubled
}

export function unusedExport() {
  return 'this should compress away'
}
