import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'

const fetcher = (url) => fetch(url).then((res) => res.json())

const useMounted = () => {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

export default function Index() {
  const mounted = useMounted()
  const router = useRouter()
  const queryString = `/api/${Object.keys(router.query).join('')}`
  const { data, error } = useSWR(() => (mounted ? queryString : null), fetcher)

  if (error) return <div>Failed to load</div>
  if (!data) return <div>Loading...</div>

  return (
    <content>
      <p>
        {queryString} routed to https://swapi.co{queryString}
      </p>
      <p>
        <a href="?people/2">Try</a>
        &nbsp;
        <a href="/">Reset</a>
      </p>
      <pre>{data ? JSON.stringify(data, null, 2) : 'Loading...'}</pre>
    </content>
  )
}
