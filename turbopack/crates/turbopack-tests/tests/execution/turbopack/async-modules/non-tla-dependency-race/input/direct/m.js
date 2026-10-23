import { base } from './root.js'

export const RATIO = '16:9'

export function sizeFor(ratio) {
  return { width: base * 128, height: base * 72, ratio }
}
