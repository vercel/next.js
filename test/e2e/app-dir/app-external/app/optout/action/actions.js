'use server'

import { value as dualPkgOptoutValue } from 'dual-pkg-optout'
import * as mod from 'dual-pkg-optout'

export async function getDualOptoutValue() {
  return dualPkgOptoutValue
}
