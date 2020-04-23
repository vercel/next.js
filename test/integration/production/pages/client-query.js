import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default () => {
  const router = useRouter()

  useEffect(() => {
    window.didHydrate = true
  }, [])

  return <div id="query">{JSON.stringify(router.query)}</div>
}
