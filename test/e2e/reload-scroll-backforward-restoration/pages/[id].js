import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

const Page = ({ id }) => {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [routeChangeComplete, setRouteChangeComplete] = useState(false)
  useEffect(() => {
    router.events.on('routeChangeComplete', () => {
      setRouteChangeComplete(true)
    })

    setReady(true)
  }, [router, routeChangeComplete, setRouteChangeComplete])

  return (
    <>
      <div
        style={{
          width: 10000,
          height: 10000,
          background: 'blue',
        }}
      />
      <p>{ready ? 'router ready' : 'loading'}</p>
      <p>{routeChangeComplete ? 'routeChangeComplete' : 'loading'}</p>
      <Link href={`/${id + 1}`}>
        <a
          id="link"
          style={{
            marginLeft: 5000,
            width: 95000,
            display: 'block',
          }}
        >
          next page
        </a>
      </Link>
      <div id="end-el">hello, world</div>
    </>
  )
}

export default Page

export const getServerSideProps = (context) => {
  const { id = 0 } = context.query
  return {
    props: {
      id,
    },
  }
}
