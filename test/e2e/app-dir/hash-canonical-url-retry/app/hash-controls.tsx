'use client'

import { usePathname, useRouter } from 'next/navigation'

export function HashControls() {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <>
      <button
        id="replace-without-hash"
        onClick={() => router.replace(pathname, { scroll: false })}
      >
        replace without hash
      </button>
      <button
        id="push-other-hash"
        onClick={() => router.push(`${pathname}#other`, { scroll: false })}
      >
        push #other
      </button>
    </>
  )
}
