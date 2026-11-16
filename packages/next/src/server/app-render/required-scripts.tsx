import { encodeURIPath } from '../../shared/lib/encode-uri-path'
import type { BuildManifest } from '../get-page-files'
import { getTurbopackBootstrap } from './turbopack-bootstrap-script'

import ReactDOM from 'react-dom'
import type { BootstrapScriptDescriptor } from 'react-dom/server'

/**
 * The Turbopack runtime reads its chunk-group bootstrap from this attribute on
 * its own `<script>` tag (`document.currentScript`), so no inline bootstrap
 * script is needed. The name is defined by the Turbopack browser runtime.
 */
const TURBOPACK_BOOTSTRAP_ATTRIBUTE = 'data-turbopack-bootstrap'

export function getRequiredScripts(
  buildManifest: BuildManifest,
  assetPrefix: string,
  crossOrigin: undefined | '' | 'anonymous' | 'use-credentials',
  SRIManifest: undefined | Record<string, string>,
  qs: string,
  nonce: string | undefined,
  pagePath: string,
  externalBrowserRuntime: boolean
): [() => void, BootstrapScriptDescriptor[]] {
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

  // With the Turbopack bootstrap as data, every root main file is
  // preinitialized and there are no `bootstrapScripts`: React can only attach
  // data attributes to preinitialized scripts, and the file that starts the app
  // is the runtime, which is last, not the first file.
  const bootstrapScripts: BootstrapScriptDescriptor[] = []
  if (turbopackBootstrapData === undefined) {
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
