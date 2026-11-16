import { encodeURIPath } from '../../shared/lib/encode-uri-path'
import type { BuildManifest } from '../get-page-files'
import { getTurbopackBootstrap } from './turbopack-bootstrap-script'

import ReactDOM from 'react-dom'

/**
 * The Turbopack runtime reads its chunk-group bootstrap from this attribute on
 * its own `<script>` tag (`document.currentScript`), so no inline bootstrap
 * script is needed. Must match the attribute configured for the client
 * chunking context in `next-core`.
 */
const TURBOPACK_BOOTSTRAP_ATTRIBUTE = 'data-turbopack-bootstrap'

type BootstrapScript = {
  src: string
  integrity?: string
  crossOrigin?: string | undefined
}

export function getRequiredScripts(
  buildManifest: BuildManifest,
  assetPrefix: string,
  crossOrigin: undefined | '' | 'anonymous' | 'use-credentials',
  SRIManifest: undefined | Record<string, string>,
  qs: string,
  nonce: string | undefined,
  pagePath: string,
  externalBrowserRuntime: boolean
): [() => void, BootstrapScript[]] {
  const files = (
    buildManifest.rootMainFilesTree?.[pagePath] || buildManifest.rootMainFiles
  ).map(encodeURIPath)
  if (files.length === 0) {
    throw new Error(
      'Invariant: missing bootstrap script. This is a bug in Next.js'
    )
  }

  // With the shared runtime, Turbopack always emits the runtime chunk as the
  // last asset of the entry chunk group, so it's the last root main file.
  const turbopackBootstrapData =
    externalBrowserRuntime && !process.env.__NEXT_DEV_SERVER
      ? getTurbopackBootstrap(buildManifest, [pagePath], true)?.data
      : undefined

  const scripts = files.map((file) => ({
    src: `${assetPrefix}/_next/` + file + qs,
    integrity: SRIManifest ? SRIManifest[file] : undefined,
  }))

  // React can only attach data attributes to preinitialized scripts, not to
  // `bootstrapScripts`. If the runtime would be the only (bootstrap) script,
  // preinitialize it as well and pass no bootstrap script: React then emits
  // its own completed-shell marker instead.
  const bootstrapScripts: BootstrapScript[] = []
  if (turbopackBootstrapData === undefined || scripts.length > 1) {
    const { src, integrity } = scripts.shift()!
    bootstrapScripts.push(
      SRIManifest ? { src, integrity, crossOrigin } : { src, crossOrigin }
    )
  }

  const preinitScripts = () => {
    for (let i = 0; i < scripts.length; i++) {
      const isTurbopackRuntime =
        turbopackBootstrapData !== undefined && i === scripts.length - 1
      ReactDOM.preinit(scripts[i].src, {
        as: 'script',
        integrity: scripts[i].integrity,
        nonce,
        crossOrigin,
        dataAttributes: isTurbopackRuntime
          ? { [TURBOPACK_BOOTSTRAP_ATTRIBUTE]: turbopackBootstrapData }
          : undefined,
      })
    }
  }

  return [preinitScripts, bootstrapScripts]
}
