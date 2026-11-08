import { evaluated } from './evaluated'

export type Result = {
  values: (string | null)[]
  // The modules of this fixture that were evaluated before and after the values were read.
  evaluated: { before: string[]; after: string[] }
}

// Calls `undeclared` always and `declared` only when `use` is set. The caller passes functions
// that read its imports, so that it reads the import of `declared` only when it is used.
export function read(
  undeclared: () => string,
  declared: () => string,
  use: boolean
): Result {
  const before = [...evaluated()]
  const values = [undeclared(), use ? declared() : null]
  return { values, evaluated: { before, after: [...evaluated()] } }
}
