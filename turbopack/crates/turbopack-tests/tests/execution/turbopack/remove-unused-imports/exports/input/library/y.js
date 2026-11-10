import { sharedY } from './shared'

globalThis.yBundled = true

export function y() {
  sharedY()
}
