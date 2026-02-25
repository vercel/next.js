'use client'

import { usePathname } from 'next/navigation'

export function PathnameReader() {
  const pathname = usePathname()
  if (pathname !== '/pathname/valid-use-pathname-with-params/123/456') {
    throw new Error(
      `ClientAssertionError: Expected pathname to be '/pathname/valid-use-pathname-with-params/123/456', got '${pathname}'`
    )
  }
  return <div id="result">pathname: {pathname}</div>
}
