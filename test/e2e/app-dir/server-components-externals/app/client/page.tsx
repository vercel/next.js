'use client'

import { dir } from 'external-package'
import { dir as subDir } from 'external-package/subpath'

export default function Page() {
  return (
    <>
      <div id="directory-ssr">{dir}</div>
      <div id="subdirectory-ssr">{subDir}</div>
    </>
  )
}
