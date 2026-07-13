import { useEffect, useState } from 'react'

export default function Page() {
  const [scope, setScope] = useState('default')
  const [controller, setController] = useState('default')
  const [script, setScript] = useState('default')
  const [fetchResult, setFetchResult] = useState('default')

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setController('unsupported')
      return
    }

    async function register() {
      const registration = await navigator.serviceWorker.register(
        new URL('../lib/pwa', import.meta.url)
      )
      setScope(registration.scope)

      await navigator.serviceWorker.ready

      const updateController = () => {
        const active = navigator.serviceWorker.controller
        setController(active ? 'controlled' : 'none')
        if (active) {
          setScript(new URL(active.scriptURL).pathname)
        }
      }
      updateController()
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        updateController
      )
    }

    register().catch((err) => {
      setController('error: ' + err.message)
    })
  }, [])

  return (
    <div>
      <p id="sw-scope">{scope}</p>
      <p id="sw-controller">{controller}</p>
      <p id="sw-script">{script}</p>
      <button
        onClick={async () => {
          const res = await fetch('/sw-intercepted')
          setFetchResult(await res.text())
        }}
      >
        Fetch through service worker
      </button>
      <p id="fetch-result">{fetchResult}</p>
    </div>
  )
}
