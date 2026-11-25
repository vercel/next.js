'use client'
import Link from 'next/link'
export default function Page() {
  return (
    <>
      <button
        id="log"
        onClick={() => console.error(new Error('navigation error'))}
      >
        Log
      </button>
      <Link
        id="navigate"
        href="/navigation/next?secret=value#fragment"
        prefetch={false}
      >
        Next
      </Link>
    </>
  )
}
