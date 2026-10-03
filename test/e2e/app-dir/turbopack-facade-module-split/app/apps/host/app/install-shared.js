'use client'

import { useEffect, useRef, useState } from 'react'
import * as hostDemoPkg from 'demo-pkg'
import { loadChunkWithScope } from './lib/chunk-loader'
import {
  createScope,
  findModuleByMarker,
  findModuleImports,
  installSharedModule,
  moduleExportsHasSingleton,
  readSingletonValue,
  requireModule,
  resolveSharedModuleId,
} from './lib/sharing-runtime'

// Drives the extracted sharing machinery, mirroring remote-components'
// loadRemoteComponent: load the remote's chunks through the scope chunk
// loader, install the host's demo-pkg at the ID the shared manifest resolves,
// then execute the remote consumer module through the scope require and
// report which singleton instance it sees.
export function InstallShared({ scriptUrls }) {
  const [state, setState] = useState(null)
  const runtime = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (scriptUrls.length === 0) {
        setState({ error: 'no remote chunks in page' })
        return
      }

      // The chunk-loading global name is read from the first chunk's
      // wrapper, the same way the package's chunk loader detects the runtime
      // and custom global from chunk code:
      // https://github.com/vercel/remote-components/blob/remote-components@0.4.15/packages/remote-components/src/runtime/turbopack/chunk-loader.ts#L102
      // (The package alternatively derives the conventional name from the
      // remote's bundle metadata, which this fixture does not carry:
      // https://github.com/vercel/remote-components/blob/remote-components@0.4.15/packages/remote-components/src/config/nextjs/index.ts#L506
      // https://github.com/vercel/remote-components/blob/remote-components@0.4.15/packages/remote-components/src/config/webpack/index.ts#L36
      // )
      const firstCode = await fetch(scriptUrls[0]).then((res) => res.text())
      const globalMatch = firstCode.match(
        /(?:globalThis|self)(?:\[\s*["']|\.)((?:TURBOPACK|remoteWebpackChunk|__remote_chunk_loading_global_)[\w$-]*)/
      )
      const globalProp = globalMatch?.[1]
      if (!globalProp) {
        setState({ error: 'no chunk-loading global found in remote chunks' })
        return
      }
      const scope = createScope('singleton-remote', globalProp)
      for (const url of scriptUrls) {
        await loadChunkWithScope(scope, url)
      }

      const sharedModuleId = resolveSharedModuleId(
        scope.turbopackModules,
        'demoPkg'
      )
      const consumerId = sharedModuleId
        ? findModuleByMarker(scope, 'remote-consumer-module-marker')
        : undefined

      if (!sharedModuleId || !consumerId) {
        setState({
          error: 'resolution failed',
          sharedModuleId: sharedModuleId ?? null,
          consumerId: consumerId ?? null,
          moduleCount: scope.turbopackModules.length,
        })
        return
      }

      // The current remote-components behavior: install at the resolved ID.
      installSharedModule(scope, sharedModuleId, hostDemoPkg)

      const consumerImports = findModuleImports(scope, consumerId)
      const consumerDemoPkgId = consumerImports.find((id) => {
        try {
          return moduleExportsHasSingleton(requireModule(scope, id))
        } catch {
          return false
        }
      })

      runtime.current = { scope, sharedModuleId, consumerDemoPkgId }
      const remoteNs = consumerDemoPkgId
        ? requireModule(scope, consumerDemoPkgId)
        : null
      const remote = remoteNs
        ? {
            instanceId: readSingletonValue(remoteNs, 'instanceId'),
            marker: readSingletonValue(remoteNs, 'marker'),
          }
        : null
      const host = {
        instanceId: hostDemoPkg.singleton.instanceId,
        marker: hostDemoPkg.singleton.marker,
      }

      if (!cancelled) {
        setState({
          sharedModuleId,
          consumerId,
          consumerDemoPkgId,
          host,
          remote,
        })
      }
    }

    run().catch((err) => {
      if (!cancelled) {
        setState({ error: String(err) })
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!state) {
    return <pre id="sharing">pending</pre>
  }
  return (
    <>
      <pre id="sharing">{JSON.stringify(state)}</pre>
      <button
        id="write-host-marker"
        onClick={() => {
          hostDemoPkg.singleton.marker = 'updated-by-host'
          const rt = runtime.current
          let remote = state.remote
          if (rt?.consumerDemoPkgId) {
            const remoteNs = requireModule(rt.scope, rt.consumerDemoPkgId)
            remote = {
              instanceId: readSingletonValue(remoteNs, 'instanceId'),
              marker: readSingletonValue(remoteNs, 'marker'),
            }
          }
          setState({
            ...state,
            host: {
              instanceId: hostDemoPkg.singleton.instanceId,
              marker: hostDemoPkg.singleton.marker,
            },
            remote,
          })
        }}
      >
        Write host marker
      </button>
    </>
  )
}
