'use client'

import { usePathname } from 'next/navigation'

export default function Page() {
  const pathname = usePathname()

  return (
    <>
      <h1 id="pathname" data-pathname={pathname}>
        hello from {pathname}
      </h1>
    </>
  )
}
