import * as ns from './enums'

// A statically tracked read of the same module whose namespace escapes elsewhere. It has to keep
// working, and it has to read the same (original) name the escaping namespace exposes.
export function read() {
  const { ENUM_B } = ns
  return ENUM_B
}
