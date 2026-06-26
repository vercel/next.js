'use server'

import { value as dualPkgOptoutValue } from 'dual-pkg-optout'

export async function getDualOptoutValue() {
  return dualPkgOptoutValue
}
