import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'

export default function Page() {
  const router = useRouter()

  const [counter, setCounter] = useState(0)
  const errorRef = useRef(null)
  const handleRouteChangeError = (err) => {
    errorRef.current = err
  }
  useEffect(() => {
    router.events.on('routeChangeError', handleRouteChangeError)

    return () => {
      router.events.off('routeChangeError', handleRouteChangeError)
    }
  })

  return (
    <>
      <div id="counter">{counter}</div>
      <div id="error">
        {errorRef.current ? JSON.stringify(errorRef.current) : ''}
      </div>
      <Link href="?prop=foo" id="link" shallow={true}>
        Click me
      </Link>
      <button
        id="router-replace"
        onClick={() => {
          setCounter(counter + 1)
          router.replace('?prop=baz', undefined, { shallow: true })
        }}
      >
        Push me
      </button>
    </>
  )
}
