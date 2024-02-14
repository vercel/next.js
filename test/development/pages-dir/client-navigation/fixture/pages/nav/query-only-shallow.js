import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef } from 'react'

export async function getServerSideProps({ query: { prop = '' } }) {
  return { props: { prop } }
}

export default function Page({ prop }) {
  const router = useRouter()

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
      <div id="prop">{prop}</div>
      <div id="error">
        {errorRef.current ? JSON.stringify(errorRef.current) : ''}
      </div>
      <Link href="?prop=foo" id="link" shallow={true}>
        Click me
      </Link>
      <button id="router-push" onClick={() => router.push('?prop=bar')}>
        Push me
      </button>
      <button
        id="router-replace"
        onClick={() =>
          router.replace('?prop=baz', undefined, { shallow: true })
        }
      >
        Push me
      </button>
    </>
  )
}
