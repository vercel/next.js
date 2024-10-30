'use client'
import { useRouter } from 'next/navigation'
import React from 'react'
import { revalidateWithTag } from './actions'

export function RevalidateButtons() {
  const router = useRouter()
  return (
    <>
      <button
        id="revalidate-a"
        onClick={() => {
          revalidateWithTag('a').then(() => router.refresh())
        }}
      >
        revalidate a
      </button>
      <button
        id="revalidate-b"
        onClick={() => {
          revalidateWithTag('b').then(() => router.refresh())
        }}
      >
        revalidate b
      </button>
      <button
        id="revalidate-c"
        onClick={() => {
          revalidateWithTag('c').then(() => router.refresh())
        }}
      >
        revalidate c
      </button>
    </>
  )
}
