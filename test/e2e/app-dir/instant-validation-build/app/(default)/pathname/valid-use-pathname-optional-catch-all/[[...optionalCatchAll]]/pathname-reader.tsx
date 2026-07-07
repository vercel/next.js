'use client'

import { usePathname } from 'next/navigation'
import { assert } from '../../../../../client-assertion-error'

export function PathnameReader() {
  const pathname = usePathname()
  assert(
    pathname === '/pathname/valid-use-pathname-optional-catch-all/xxx/yyy',
    `Expected pathname to be '/pathname/valid-use-pathname-optional-catch-all/xxx/yyy', got '${pathname}'`
  )
  return <div id="result">pathname: {pathname}</div>
}
