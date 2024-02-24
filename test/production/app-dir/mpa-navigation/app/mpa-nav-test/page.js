'use client'
import Link from 'next/link'
import { useEffect, useRef } from 'react'

export default function Page() {
  const prefetchRef = useRef()
  const slowPageRef = useRef()

  useEffect(() => {
    function triggerPrefetch() {
      const event = new MouseEvent('mouseover', {
        view: window,
        bubbles: true,
        cancelable: true,
      })

      prefetchRef.current.dispatchEvent(event)
      console.log('dispatched')
    }

    slowPageRef.current.click()

    setInterval(() => {
      triggerPrefetch()
    }, 1000)
  }, [])

  return (
    <>
      <Link id="link-to-slow-page" href="/slow-page" ref={slowPageRef}>
        To /slow-page
      </Link>
      <Link id="prefetch-link" href="/hash" ref={prefetchRef}>
        Prefetch link
      </Link>
    </>
  )
}
