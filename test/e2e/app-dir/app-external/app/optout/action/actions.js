'use server'

// import * as dualPkgOptout from 'dual-pkg-optout'
import { value as dualPkgOptoutValue } from 'dual-pkg-optout'
// const { value: dualPkgOptoutValue } = require('dual-pkg-optout')

export async function getDualOptoutValue() {
  return dualPkgOptoutValue
}
