import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

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

function Debug({ name, value }) {
  return (
    <>
      <dt>{name}</dt>
      <dd id={name}>{value}</dd>
    </>
  )
}

export default function Custom404() {
  const router = useRouter()
  const [debug, setDebug] = useState({})

  useEffect(() => {
    setDebug(transform(router))
  }, [router])

  return (
    <dl>
      <Debug name="pathname" value={debug.pathname} />
      <Debug name="asPath" value={debug.asPath} />
      <Debug name="query" value={debug.query} />
      <Debug name="isReady" value={debug.isReady} />
    </dl>
  )
}
