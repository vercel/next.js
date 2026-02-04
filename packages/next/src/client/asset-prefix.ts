import { InvariantError } from '../shared/lib/invariant-error'

export function getAssetPrefix() {
  const currentScript = document.currentScript

  if (!(currentScript instanceof HTMLScriptElement)) {
    throw new InvariantError(
      `Expected document.currentScript to be a <script> element. Received ${currentScript} instead.`
    )
  }

  const { pathname } = new URL(currentScript.src)
  const nextIndex = pathname.indexOf('/_next/')

  if (nextIndex === -1) {
    throw new InvariantError(
      `Expected document.currentScript src to contain '/_next/'. Received ${currentScript.src} instead.`
    )
  }

  return pathname.slice(0, nextIndex)
}
