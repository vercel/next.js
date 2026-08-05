'use client'

import { usePathname, useRouter } from 'next/navigation'

export function ReplaceButton() {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <button
      id="replace-without-hash"
      onClick={() => router.replace(pathname, { scroll: false })}
    >
      Replace with the current pathname
    </button>
  )
}
