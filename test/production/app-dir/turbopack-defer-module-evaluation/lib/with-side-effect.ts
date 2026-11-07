import { evaluated } from './evaluated'

// A side effect at the top level: this module is never evaluated late.
evaluated().push('with-side-effect')

export function withSideEffect() {
  return 'with-side-effect'
}
