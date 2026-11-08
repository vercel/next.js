import { evaluated } from '../evaluated'

// `package.json` declares the modules of this directory free of side effects. The push only makes
// the evaluation of this module visible to the test.
evaluated().push('declared:pages-page')

export function declared() {
  return 'declared:pages-page'
}
