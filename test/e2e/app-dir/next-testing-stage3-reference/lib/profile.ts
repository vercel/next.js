export function productionValue() {
  if (process.env.NODE_ENV === 'production') {
    return 'L3_PRODUCTION_BRANCH'
  }
  return 'L3_DEVELOPMENT_BRANCH_MUST_BE_ELIMINATED'
}
