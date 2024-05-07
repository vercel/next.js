/* eslint-disable no-script-url */
'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  const [, startTransition] = useTransition()

  return (
    <button
      id="trigger"
      onClick={() => {
        startTransition(() => {
          router.push({
            unsafeHref: {
              __href: "javascript:console.log('XSS trusted push');",
            },
          })
        })
      }}
    >
      trusted push
    </button>
  )
}
