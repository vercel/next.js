'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'

export default function Page() {
  const router = useRouter()

  return (
    <dialog open>
      <h1>Modal</h1>

      <br />

      <button onClick={() => router.refresh()} id="refresh-router">
        Refresh Router
      </button>
      <Link href="/">Close</Link>
    </dialog>
  )
}
