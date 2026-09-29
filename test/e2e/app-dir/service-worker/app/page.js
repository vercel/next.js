'use client'
import { useEffect, useState } from 'react'

export default function Page() {
  const [scope, setScope] = useState('default')
  const [controller, setController] = useState('default')
  const [script, setScript] = useState('default')
  const [fetchResult, setFetchResult] = useState('default')
  const [interceptPath, setInterceptPath] = useState('/sw-intercepted')
  const [updateViaCache, setUpdateViaCache] = useState('default')

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setController('unsupported')
      return
    }

    async function register() {
      const registration = await navigator.serviceWorker.register(
        new URL('../lib/pwa', import.meta.url),
        { updateViaCache: 'none' }
      )
      setScope(registration.scope)

      // `updateViaCache` reflects the option passed to `register()`. The codegen pins `{ scope }`
      // but must merge it into the user's options, so this stays `'none'` (not the default
      // `'imports'`) only if those options were preserved.
      setUpdateViaCache(registration.updateViaCache)

      // Fetch a sentinel URL that lives inside the registration scope (e.g. `/sw-intercepted` or
      // `/base/sw-intercepted`), so the service worker actually controls the request.
      const scopePath = new URL(registration.scope).pathname.replace(/\/$/, '')
      setInterceptPath(`${scopePath}/sw-intercepted`)

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
      <p id="sw-update-via-cache">{updateViaCache}</p>
      <button
        onClick={async () => {
          const res = await fetch(interceptPath)
          setFetchResult(await res.text())
        }}
      >
        Fetch through service worker
      </button>
      <p id="fetch-result">{fetchResult}</p>
    </div>
  )
}
