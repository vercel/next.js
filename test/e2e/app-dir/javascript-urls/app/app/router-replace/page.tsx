'use client'

import { useRouter } from 'next/navigation'

import { DANGEROUS_JAVASCRIPT_URL } from '../../../bad-url'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <p>
        Clicking this button should result in an error where Next.js blocks a
        javascript URL
      </p>
      <button onClick={() => router.replace(DANGEROUS_JAVASCRIPT_URL)}>
        replace javascript URL
      </button>
    </>
  )
}
