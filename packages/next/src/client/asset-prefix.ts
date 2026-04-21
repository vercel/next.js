import { InvariantError } from '../shared/lib/invariant-error'

declare const __turbopack_runtime_url__: (() => string) | undefined

export function getAssetPrefix() {
  const currentScript = document.currentScript

  let src: string

  if (currentScript instanceof HTMLScriptElement) {
    src = currentScript.src
  } else if (typeof __turbopack_runtime_url__ === 'function') {
    // In ESM mode the bootstrap runs inside <script type="module"> where
    // document.currentScript is always null. The Turbopack runtime exposes
    // the evaluate-chunk URL via __turbopack_runtime_url__ instead.
    src = __turbopack_runtime_url__()
  } else {
    throw new InvariantError(
      `Expected document.currentScript to be a <script> element. Received ${currentScript} instead.`
    )
  }

  const { pathname } = new URL(src)
  const nextIndex = pathname.indexOf('/_next/')

  if (nextIndex === -1) {
    throw new InvariantError(
      `Expected document.currentScript src to contain '/_next/'. Received ${src} instead.`
    )
  }

  return pathname.slice(0, nextIndex)
}
