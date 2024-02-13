'use client'

import { dir } from 'external-package'

export default function Page() {
  return <div id="directory-ssr">{dir}</div>
}
