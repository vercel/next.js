import { b } from './cycle-b.js'

globalThis.deferEvents.push('cycle-a')

export function a() {
  return 'a' + b()
}
