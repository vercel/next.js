'use client'

import { baz } from './barrel'

export default function Page() {
  // Test DCE
  if (1 + 1 === 3) {
    baz()
  }

  return <div>hi</div>
}
