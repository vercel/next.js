import { evaluated } from '../evaluated'

// `package.json` declares the modules of this directory free of side effects. The push only makes
// the evaluation of this module visible to the test.
evaluated().push('declared:route')

export function declared() {
  return 'declared:route'
}
