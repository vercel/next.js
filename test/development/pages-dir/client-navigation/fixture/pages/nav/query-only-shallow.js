import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

export default function Page() {
  const router = useRouter()

  const [routeState, setRouteResult] = useState({
    completed: 0,
    errors: 0,
  })
  useEffect(() => {
    const increaseErrorCount = () =>
      setRouteResult((state) => ({ ...state, errors: state.errors + 1 }))
    const increaseRouteComplete = () =>
      setRouteResult((state) => ({ ...state, completed: state.completed + 1 }))
    router.events.on('routeChangeError', increaseErrorCount)
    router.events.on('routeChangeComplete', increaseRouteComplete)

    return () => {
      router.events.off('routeChangeError', increaseErrorCount)
      router.events.off('routeChangeComplete', increaseRouteComplete)
    }
  })

  return (
    <>
      <div id="routeState">{JSON.stringify(routeState)}</div>
      <Link href="?prop=foo" id="link" shallow={true}>
        Click me
      </Link>
      <button
        id="router-replace"
        onClick={() => {
          router.replace('?prop=baz', undefined, { shallow: true })
        }}
      >
        Push me
      </button>
    </>
  )
}
