'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <div>
        <Link href="/search-params?id=1" prefetch>
          /search-params?id=1 (prefetch: true)
        </Link>
      </div>
      <button
        onClick={() => {
          router.push('/search-params?id=2')
        }}
      >
        Navigate to /search-params?id=2
      </button>
    </>
  )
}
