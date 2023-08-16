/*global navigation*/
'use client'

import { redirect, useSearchParams } from 'next/navigation'

let listening = false

export default function Page({ params: { storageKey } }) {
  if (typeof window === 'undefined') {
    throw new Error('Client render only')
  }

  let searchParams = useSearchParams()

  if (searchParams.get('read')) {
    // Read all matching logs and print them
    let storage = Object.fromEntries(
      Object.entries(sessionStorage).flatMap(([key, value]) =>
        key.startsWith(`${storageKey}/`)
          ? [[key.slice(storageKey.length + 1), value]]
          : []
      )
    )

    return <pre id="storage">{JSON.stringify(storage, null, 2)}</pre>
  } else {
    // Count number of navigations triggered (in browsers that support it)
    sessionStorage.setItem(
      `${storageKey}/navigation-supported`,
      typeof navigation !== 'undefined'
    )
    if (!listening && typeof navigation !== 'undefined') {
      listening = true
      navigation.addEventListener('navigate', (event) => {
        if (!event.destination.sameDocument) {
          let key = `${storageKey}/navigate-${event.destination.url}`
          let count = +sessionStorage.getItem(key)
          sessionStorage.setItem(key, count + 1)
        }
      })
    }

    redirect('https://example.vercel.sh/')
  }
}
