import { readReexported } from './cycle_reexport_b.js'

export const reexportedConstant = 'reexportedConstant'
export const cycleResult = readReexported()
