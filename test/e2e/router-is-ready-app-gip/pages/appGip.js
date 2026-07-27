import { useRouter } from 'next/router'
import { useLayoutEffect } from 'react'

export default function Page(props) {
  const router = useRouter()

  if (typeof window !== 'undefined') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useLayoutEffect(() => {
      if (!window.isReadyValues) {
        window.isReadyValues = []
      }
      window.isReadyValues.push(router.isReady)
    }, [router])
  }

  return (
    <>
      <p id="appGip">appGip page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
