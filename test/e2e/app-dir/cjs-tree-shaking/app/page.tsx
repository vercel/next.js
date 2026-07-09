'use client'

import { used } from '../lib/legacy'
import { objUsed } from '../lib/object-exports'
import transpiledDefault, { named } from '../lib/transpiled'

export default function Page() {
  return (
    <>
      <p id="named">{used}</p>
      <p id="object">{objUsed}</p>
      <p id="default">{transpiledDefault}</p>
      <p id="esm-named">{named}</p>
    </>
  )
}
