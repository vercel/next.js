'use server'

import * as mod from 'dual-pkg-optout'
import { value as dualPkgOptoutValue } from 'dual-pkg-optout'

// console.log('dualPkgOptout:mod', mod)
export async function getDualOptoutValue() {
  // console.log('getDualOptoutValue', mod)
  return dualPkgOptoutValue
}
