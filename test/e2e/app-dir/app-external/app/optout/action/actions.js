'use server'

import * as dualPkgOptout from 'dual-pkg-optout'
import { value as dualPkgOptoutValue } from 'dual-pkg-optout'

// console.log(
//   'server import dualPkgOptoutValue',
//   dualPkgOptoutValue,
//   'dualPkgOptout',
//   dualPkgOptout,
// )
// if (dualPkgOptout?.then && typeof dualPkgOptout.then === 'function') {

//   dualPkgOptout?.then(v => {
//     console.log('dualPkgOptout.then', v)
//   })
// }

export async function getDualOptoutValue() {
  return dualPkgOptoutValue
}
