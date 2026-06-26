import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Debug from './debug'

function transform(router) {
  return {
    pathname: router.pathname,
    asPath: router.asPath,
    query: Object.entries(router.query)
      .map(([key, value]) => [key, value].join('='))
      .join('&'),
    isReady: router.isReady ? 'true' : 'false',
  }
}

export default function DebugError({ children }) {
  const router = useRouter()
  const [debug, setDebug] = useState({})

  useEffect(() => {
    setDebug(transform(router))
  }, [router])

  return (
    <>
      <dl>
        <Debug name="pathname" value={debug.pathname} />
        <Debug name="asPath" value={debug.asPath} />
        <Debug name="query" value={debug.query} />
        <Debug name="isReady" value={debug.isReady} />
      </dl>
      {children}
    </>
  )
}
