import React from 'react'
import ReactDOM from 'react-dom'
import { useCachedPromise } from './promise-cache'

export default function Hello({ name, thrown = false }) {
  useCachedPromise(
    name,
    () => new Promise((resolve) => setTimeout(resolve, 200)),
    thrown
  )

  const [hydrated, setHydrated] = React.useState(() => false)
  React.useEffect(() => {
    if (!hydrated) {
      setHydrated(true)
    }
  }, [hydrated])

  const serverRendered = React.useMemo(() => {
    if (typeof window === 'undefined') {
      return true
    }
    const elem = document.getElementById('server-rendered')
    if (elem) {
      return elem.innerText === 'true'
    }
    return false
  }, [])

  return (
    <p>
      hello {ReactDOM.version}
      <span id="server-rendered">{serverRendered.toString()}</span>
      {hydrated ? <span id="hydrated">{hydrated.toString()}</span> : null}
    </p>
  )
}
