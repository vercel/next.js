const key = 'env'
const {
  [key]: { ...rest },
} = process
foo(rest)
