import { b } from './below-cycle-b.js'

globalThis.deferEvents.push('below-cycle-a')

export function a() {
  return 'a' + b()
}
