'use client'

import { usePathname } from 'next/navigation'
import { assert } from '../../../../../client-assertion-error'

export function PathnameReader() {
  const pathname = usePathname()
  assert(
    pathname === '/pathname/valid-use-pathname-catch-all/aaa/bbb/ccc',
    `Expected pathname to be '/pathname/valid-use-pathname-catch-all/aaa/bbb/ccc', got '${pathname}'`
  )
  return <div id="result">pathname: {pathname}</div>
}
