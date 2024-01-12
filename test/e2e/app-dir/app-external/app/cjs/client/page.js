'use client'

import { instance } from 'cjs-modern-syntax'
import { packageName } from 'test/e2e/app-dir/app-external/node_modules_bak/transpile-cjs-lib'
export default function Page() {
  return (
    <>
      <div id="private-prop">{instance.getProp()}</div>
      <div id="transpile-cjs-lib">{packageName}</div>
    </>
  )
}
