const local = 'direct'

function nested() {
  // A direct eval can reference module bindings by name, so this module must
  // not be merged (merging may rename `local`).
  // prettier-ignore
  return (eval)('local')
}

export const direct = eval('local') + nested()
