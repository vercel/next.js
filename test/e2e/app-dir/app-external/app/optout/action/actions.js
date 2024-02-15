'use server'

import { value as dualPkgOptoutValue } from 'dual-pkg-optout'
import * as dualPkgOptout from 'dual-pkg-optout'

console.log(
  'server import dualPkgOptoutValue',
  dualPkgOptoutValue,
  'dualPkgOptout',
  dualPkgOptout
)

export async function getDualOptoutValue() {
  return dualPkgOptoutValue
}
