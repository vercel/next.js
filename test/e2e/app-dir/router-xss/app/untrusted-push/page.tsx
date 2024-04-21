/* eslint-disable no-script-url */
'use client'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()

  return (
    <button
      id="trigger"
      onClick={() => {
        router.push("javascript:console.log('XSS untrusted push');")
      }}
    >
      untrusted push
    </button>
  )
}
