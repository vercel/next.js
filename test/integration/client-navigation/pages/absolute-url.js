import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <Link href="https://vercel.com/">
        <a id="absolute-link">Go</a>
      </Link>
      <button
        id="router-push"
        onClick={() => router.push('https://vercel.com/')}
      >
        Go push
      </button>
      <button
        id="router-replace"
        onClick={() => router.replace('https://vercel.com/')}
      >
        Go replace
      </button>
    </>
  )
}
