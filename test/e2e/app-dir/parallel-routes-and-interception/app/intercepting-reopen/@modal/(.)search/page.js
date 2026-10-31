'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// After a soft navigation to a URL with no matching @modal route, the slot
// keeps rendering this segment. Only show the modal while the URL is /search.
export default function SearchModal() {
  const pathname = usePathname()
  if (!pathname.startsWith('/intercepting-reopen/search')) {
    return null
  }
  return (
    <div id="search-modal" role="dialog">
      <p>search modal (intercepted)</p>
      <Link id="result-link" href="/intercepting-reopen/items/1">
        go to item 1
      </Link>
    </div>
  )
}
