import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useState } from 'react'

export default function Page(props) {
  const router = useRouter()
  const [asPath, setAsPath] = useState(
    router.isReady ? router.asPath : router.href
  )

  useEffect(() => {
    if (router.isReady) {
      setAsPath(router.asPath)
    }
  }, [router.asPath, router.isReady])

  return (
    <>
      <p id="ssg">/blog/[slug]</p>
      <p id="query">{JSON.stringify(router.query)}</p>
      <p id="pathname">{router.pathname}</p>
      <p id="as-path">{asPath}</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export function getStaticProps({ params }) {
  return {
    props: {
      now: Date.now(),
      params,
    },
  }
}

export function getStaticPaths() {
  return {
    paths: ['/ssg/first', '/ssg/hello'],
    fallback: 'blocking',
  }
}
