'use client'

import { usePathname, useRouter } from 'next/navigation'

export default function ProductPage() {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <>
      <h1 id="product-page">Product {pathname}</h1>
      <button
        id="replace-without-hash"
        onClick={() => router.replace(pathname, { scroll: false })}
      >
        router.replace(pathname)
      </button>
    </>
  )
}
