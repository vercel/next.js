import { version } from 'esm-with-react'
import { packageEntry as compatPackageEntry } from 'cjs-esm-compat'
import { packageName } from 'cjs-lib'

import React from 'react'

export default function Index() {
  return (
    <div>
      <h2>{'App React Version: ' + React.version}</h2>
      <h2>{'External React Version: ' + version}</h2>
      <h2>{`CJS-ESM Compat package: ${compatPackageEntry}`}</h2>
      <h2>{`CJS package: ${packageName}`}</h2>
    </div>
  )
}
