'use client'

import { usePathname } from 'next/navigation'
import { assert } from '../../../../../../client-assertion-error'

export function PathnameReader() {
  const pathname = usePathname()
  assert(
    pathname === '/pathname/valid-use-pathname-with-params/123/456',
    `Expected pathname to be '/pathname/valid-use-pathname-with-params/123/456', got '${pathname}'`
  )
  return <div id="result">pathname: {pathname}</div>
}
