import { useRouter } from 'next/router'
import { useEffect } from 'react'

const Page = () => {
  const router = useRouter()

  useEffect(() => {
    window.didHydrate = true
  }, [])

  return <div id="query">{JSON.stringify(router.query)}</div>
}

Page.getInitialProps = () => ({ hello: 'world' })

export default Page
