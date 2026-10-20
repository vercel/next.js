// `local` collides with bindings in other modules, so merging would rename it,
// breaking the direct evals below that look it up by name.
const local = 'direct'

export function readLocal() {
  return eval('local')
}

export function readNested() {
  // prettier-ignore
  return (() => (eval)('local'))()
}
