'use client'

import { instance } from 'cjs-modern-syntax'
import { packageName } from 'transpile-cjs-lib'

export default function Page() {
  return (
    <>
      <div id="private-prop">{instance.getProp()}</div>
      <div id="transpile-cjs-lib">{packageName}</div>
    </>
  )
}
