'use client'

import dynamic from 'next/dynamic'
import { getInstance, init } from '@module-federation/runtime-tools/runtime'
import { useEffect, useState } from 'react'
// @ts-expect-error -- configured as an eager shared module
import { value as eagerValue } from 'eager-local'

const StaticSharedValue = dynamic(() => import('./static-shared-value'), {
  ssr: false,
})

const RemoteComponent = dynamic(
  // @ts-expect-error -- provided by Module Federation at runtime
  () => import('catalog/component'),
  { ssr: false, loading: () => <p>loading remote component</p> }
)

export function RemoteMessage() {
  const [message, setMessage] = useState('loading')
  const [runtimeName, setRuntimeName] = useState('loading')
  const [runtimeIsolation, setRuntimeIsolation] = useState('loading')
  const [shareStrategy, setShareStrategy] = useState('loading')
  const [dynamicMessage, setDynamicMessage] = useState('loading')
  const [manifestMessage, setManifestMessage] = useState('not configured')
  const [manifestObjectMessage, setManifestObjectMessage] =
    useState('not configured')
  const [preloadedMessage, setPreloadedMessage] = useState('not configured')
  const [badManifestError, setBadManifestError] = useState('not configured')
  const [missingManifestError, setMissingManifestError] =
    useState('not configured')
  const [fallbackRemoteMessage, setFallbackRemoteMessage] = useState('loading')
  const [pluginMarker, setPluginMarker] = useState('loading')
  const [hostShared, setHostShared] = useState('loading')
  const [shared, setShared] = useState('loading')
  const [remoteShared, setRemoteShared] = useState('loading')
  const [strictError, setStrictError] = useState('loading')
  const [fallback, setFallback] = useState('loading')
  const [defaultShared, setDefaultShared] = useState('loading')
  const [workerMessage, setWorkerMessage] = useState('loading')
  const [scriptCount, setScriptCount] = useState('loading')
  const [unionRange, setUnionRange] = useState('loading')
  const [hyphenRange, setHyphenRange] = useState('loading')
  const [caretRange, setCaretRange] = useState('loading')
  const [prefixFallback, setPrefixFallback] = useState('loading')

  useEffect(() => {
    async function load() {
      setRuntimeName(getInstance()?.name ?? 'missing')
      setShareStrategy(getInstance()?.options.shareStrategy ?? 'missing')
      const fallbackModule = await import('local-fallback')
      setFallback(fallbackModule.value)
      const defaultSharedModule = await import('default-shared')
      setDefaultShared(defaultSharedModule.value)
      // @ts-expect-error -- matched by a trailing-slash shared prefix
      const prefixModule = await import('prefix/item')
      setPrefixFallback(prefixModule.value)

      const remoteEntry = `${process.env.NEXT_PUBLIC_MF_REMOTE_ORIGIN}/browser/remoteEntry.js`
      // Insert the remote entry first. Federation should attach to this in-flight script rather
      // than adding a duplicate tag.
      if (
        !Array.from(document.scripts).some(
          (script) => script.src === remoteEntry
        )
      ) {
        const script = document.createElement('script')
        script.src = remoteEntry
        document.head.appendChild(script)
      }

      // Import shared keys directly before any remote expose. The host has the higher
      // `shared-value`, while the remote has the higher `remote-shared`.
      // @ts-expect-error -- configured as a shared module at runtime
      const hostSharedModule = await import('shared-value')
      setHostShared(hostSharedModule.value)
      // @ts-expect-error -- provided by the remote share scope at runtime
      const sharedModule = await import('remote-shared')
      setShared(sharedModule.value)
      // @ts-expect-error -- provided by Module Federation at runtime
      const remote = await import('catalog/message')
      setMessage(remote.message)
      // @ts-expect-error -- configured with a failing script and a working fallback
      const fallbackRemote = await import('fallbackCatalog/message')
      setFallbackRemoteMessage(fallbackRemote.message)
      setPluginMarker(
        Reflect.get(globalThis, '__federationPluginMarker') ?? 'missing'
      )
      const instance = getInstance()
      if (!instance) throw new Error('Enhanced federation instance is missing')
      instance.registerRemotes([
        {
          name: 'dynamicCatalog',
          entry: remoteEntry,
          entryGlobalName: 'catalog',
          type: 'var',
        },
      ])
      const dynamicRemote = await instance.loadRemote<typeof remote>(
        'dynamicCatalog/message'
      )
      setDynamicMessage(dynamicRemote?.message ?? 'missing')
      if (process.env.NEXT_PUBLIC_MF_REMOTE_MANIFEST) {
        const fromString = await instance.loadRemote<typeof remote>(
          'catalogManifest/message'
        )
        setManifestMessage(fromString?.message ?? 'missing')
        const fromObject = await instance.loadRemote<typeof remote>(
          'catalogObject/message'
        )
        setManifestObjectMessage(fromObject?.message ?? 'missing')
        instance.registerRemotes([
          {
            name: 'dynamicManifest',
            entry: `${process.env.NEXT_PUBLIC_MF_REMOTE_MANIFEST}?dynamic=1`,
          },
        ])
        await instance.preloadRemote([
          {
            nameOrAlias: 'dynamicManifest',
            exposes: ['./message', './component'],
            resourceCategory: 'all',
          },
        ])
        const preloaded = await instance.loadRemote<typeof remote>(
          'dynamicManifest/message'
        )
        setPreloadedMessage(preloaded?.message ?? 'missing')
        const base = process.env.NEXT_PUBLIC_MF_REMOTE_MANIFEST.replace(
          /mf-manifest\.json$/,
          ''
        )
        // Invalid remotes should not poison version-first sharing in the real host.
        const invalidHost = init({
          name: 'invalidManifestHost',
          remotes: [],
          shared: {},
          shareStrategy: 'loaded-first',
        })
        invalidHost.registerRemotes([
          { name: 'badManifest', entry: `${base}invalid-manifest.json` },
          { name: 'missingManifest', entry: `${base}missing-manifest.json` },
        ])
        try {
          await invalidHost.loadRemote('badManifest/message')
        } catch (error) {
          setBadManifestError((error as Error).message)
        }
        try {
          await invalidHost.loadRemote('missingManifest/message')
        } catch (error) {
          setMissingManifestError((error as Error).message)
        }
      }
      const other = init({ name: 'independentHost', remotes: [], shared: {} })
      setRuntimeIsolation(
        getInstance((host) => host.name === 'nextHost') === instance &&
          getInstance((host) => host.name === 'independentHost') === other &&
          instance !== other
          ? 'isolated'
          : 'collided'
      )
      setRemoteShared(remote.remoteShared)
      // @ts-expect-error -- provided by the configured share scope
      const unionModule = await import('range-union')
      setUnionRange(unionModule.value)
      // @ts-expect-error -- provided by the configured share scope
      const hyphenModule = await import('range-hyphen')
      setHyphenRange(hyphenModule.value)
      // @ts-expect-error -- provided by the configured share scope
      const caretModule = await import('range-v1')
      setCaretRange(caretModule.value)
      setScriptCount(
        String(
          Array.from(document.scripts).filter(
            (script) => script.src === remoteEntry
          ).length
        )
      )
      try {
        // @ts-expect-error -- configured to exercise a strict version mismatch
        await import('strict-remote-shared')
      } catch (error) {
        setStrictError((error as Error).message)
      }
    }
    load().catch((error) => setMessage(`error: ${error.stack ?? error}`))

    const worker = new Worker(
      new URL('./federation-worker.ts', import.meta.url),
      { type: 'classic' }
    )
    worker.onmessage = ({ data }) => {
      setWorkerMessage(data.value ?? `error: ${data.error}`)
    }
    worker.postMessage('load')
    return () => worker.terminate()
  }, [])

  return (
    <>
      <p id="remote-message">{message}</p>
      <p id="enhanced-runtime-name">{runtimeName}</p>
      <p id="enhanced-runtime-isolation">{runtimeIsolation}</p>
      <p id="enhanced-share-strategy">{shareStrategy}</p>
      <p id="enhanced-dynamic-message">{dynamicMessage}</p>
      <p id="manifest-string-message">{manifestMessage}</p>
      <p id="manifest-object-message">{manifestObjectMessage}</p>
      <p id="manifest-preloaded-message">{preloadedMessage}</p>
      <p id="manifest-invalid-error">{badManifestError}</p>
      <p id="manifest-missing-error">{missingManifestError}</p>
      <p id="enhanced-fallback-remote">{fallbackRemoteMessage}</p>
      <p id="enhanced-plugin-marker">{pluginMarker}</p>
      <RemoteComponent />
      <p id="host-shared-message">{hostShared}</p>
      <StaticSharedValue />
      <p id="shared-message">{shared}</p>
      <p id="remote-shared-message">{remoteShared}</p>
      <p id="strict-error">{strictError}</p>
      <p id="fallback-message">{fallback}</p>
      <p id="default-shared-message">{defaultShared}</p>
      <p id="worker-message">{workerMessage}</p>
      <p id="remote-script-count">{scriptCount}</p>
      <p id="union-range">{unionRange}</p>
      <p id="hyphen-range">{hyphenRange}</p>
      <p id="caret-range">{caretRange}</p>
      <p id="prefix-fallback">{prefixFallback}</p>
      <p id="eager-value">{eagerValue}</p>
    </>
  )
}
