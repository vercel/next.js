export const value = 42
if (process.env.NODE_ENV !== 'production') {
  throw new Error('A3_DEVELOPMENT_BRANCH_MUST_BE_ELIMINATED')
}

export const secondValue = 'disjoint second export'
