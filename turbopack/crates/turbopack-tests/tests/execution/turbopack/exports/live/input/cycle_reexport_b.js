import { reexportedConstant } from './cycle_reexport_barrel.js'

export function readReexported() {
  return reexportedConstant
}
