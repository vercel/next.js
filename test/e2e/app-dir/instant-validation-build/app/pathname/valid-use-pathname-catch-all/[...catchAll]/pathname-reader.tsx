'use client'

import { usePathname } from 'next/navigation'

export function PathnameReader() {
  const pathname = usePathname()
  if (pathname !== '/pathname/valid-use-pathname-catch-all/aaa/bbb/ccc') {
    throw new Error(
      `ClientAssertionError: Expected pathname to be '/pathname/valid-use-pathname-catch-all/aaa/bbb/ccc', got '${pathname}'`
    )
  }
  return <div id="result">pathname: {pathname}</div>
}
