'use client'

import { usePathname } from 'next/navigation'

export function PathnameReader() {
  const pathname = usePathname()
  if (pathname !== '/pathname/valid-use-pathname-route-group') {
    throw new Error(
      `ClientAssertionError: Expected pathname to be '/pathname/valid-use-pathname-route-group', got '${pathname}'`
    )
  }
  return <div id="result">pathname: {pathname}</div>
}
