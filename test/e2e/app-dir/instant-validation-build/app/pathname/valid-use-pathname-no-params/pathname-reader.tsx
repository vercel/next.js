'use client'

import { usePathname } from 'next/navigation'

export function PathnameReader() {
  const pathname = usePathname()
  if (pathname !== '/pathname/valid-use-pathname-no-params') {
    throw new Error(
      `ClientAssertionError: Expected pathname to be '/pathname/valid-use-pathname-no-params', got '${pathname}'`
    )
  }
  return <div id="result">pathname: {pathname}</div>
}
