import { InvariantError } from '../shared/lib/invariant-error'

export function getAssetPrefix() {
  const currentScript = document.currentScript

  if (!(currentScript instanceof HTMLScriptElement)) {
    throw new InvariantError(
      `Expected document.currentScript to be a <script> element. Received ${currentScript} instead.`
    )
  }

  const { pathname } = new URL(currentScript.src)

  return pathname.slice(0, pathname.indexOf('/_next/static'))
}
