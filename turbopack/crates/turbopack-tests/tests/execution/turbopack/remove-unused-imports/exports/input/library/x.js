import { sharedX } from './shared'

globalThis.xBundled = true

export function x() {
  sharedX()
}
