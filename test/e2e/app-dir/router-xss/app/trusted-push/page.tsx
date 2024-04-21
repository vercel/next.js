/* eslint-disable no-script-url */
'use client'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()

  return (
    <button
      id="trigger"
      onClick={() => {
        router.push({
          unsafeHref: {
            __href: "javascript:console.log('XSS trusted push');",
          },
        })
      }}
    >
      trusted push
    </button>
  )
}
