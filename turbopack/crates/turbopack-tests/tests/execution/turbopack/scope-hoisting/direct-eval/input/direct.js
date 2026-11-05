// `local` collides with bindings in other modules, so merging would rename it,
// breaking the direct evals below that look it up by name.
import { directValue } from './dependency.js'

const local = 'direct'
const importedLocal = directValue

export function readLocal() {
  return eval('local')
}

export function readNested() {
  // prettier-ignore
  return (() => (eval)('local'))()
}

export function readImported() {
  return eval('importedLocal')
}
