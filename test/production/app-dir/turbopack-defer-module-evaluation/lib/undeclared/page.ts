import { evaluated } from '../evaluated'

// A side effect at the top level of a module that nothing declares free of side effects: it is
// evaluated before the module that imports it.
evaluated().push('undeclared:page')

export function undeclared() {
  return 'undeclared:page'
}
