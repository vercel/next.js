import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { useEffect } from 'react'

export default () => {
  const router = useRouter()
  useEffect(() => {
    router.events.on('routeChangeError', err => {
      if (err.cancelled) {
        window.routeCancelled = 'yes'
      }
    })

    // Intentionally is not cleaned up
  }, [router.events])
  return (
    <>
      <Link href="/page1">
        <a id="link-1">Page 1</a>
      </Link>{' '}
      <Link href="/page2">
        <a id="link-2">Page 2</a>
      </Link>
    </>
  )
}
