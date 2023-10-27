/*global navigation*/
'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useTransition } from 'react'

let listening = false
let startedNavigating = false

export default function Page({ params: { storageKey } }) {
  if (typeof window === 'undefined') {
    throw new Error('Client render only')
  }

  let router = useRouter()
  let path = usePathname()
  let searchParams = useSearchParams().toString()
  if (searchParams) {
    path += `?${searchParams}`
  }

  // Log every pathname+searchParams we've seen
  sessionStorage.setItem(`${storageKey}/path-${path}`, 'true')

  let [isPending, startTransition] = useTransition()
  useEffect(() => {
    if (startedNavigating) {
      sessionStorage.setItem(`${storageKey}/lastIsPending`, isPending)
    }
  })

  // Read all matching logs and print them
  let storage = Object.fromEntries(
    Object.entries(sessionStorage).flatMap(([key, value]) =>
      key.startsWith(`${storageKey}/`)
        ? [[key.slice(storageKey.length + 1), value]]
        : []
    )
  )

  return (
    <>
      <button
        id="go"
        onClick={() => {
          // Count number of navigations triggered (in browsers that support it)
          sessionStorage.setItem(
            `${storageKey}/navigation-supported`,
            typeof navigation !== 'undefined'
          )
          if (!listening && typeof navigation !== 'undefined') {
            listening = true
            navigation.addEventListener('navigate', (event) => {
              let key = `${storageKey}/navigate-${event.destination.url}`
              let count = +sessionStorage.getItem(key)
              sessionStorage.setItem(key, count + 1)
            })
          }

          startedNavigating = true
          startTransition(() => {
            router.push('https://example.vercel.sh/stuff?abc=123')
          })
        }}
      >
        go
      </button>
      <pre id="storage">{JSON.stringify(storage, null, 2)}</pre>
    </>
  )
}
