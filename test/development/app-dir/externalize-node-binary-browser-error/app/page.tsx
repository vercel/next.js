'use client'

import { foo } from 'foo-browser-import-binary'

export default function Page() {
  return <p>{foo()}</p>
}
