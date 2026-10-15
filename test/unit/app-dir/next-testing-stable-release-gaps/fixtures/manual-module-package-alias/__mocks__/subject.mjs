import { helper } from '../support.mjs'
globalThis.manualOrder.push('manual-start')
await Promise.resolve()
globalThis.manualOrder.push('manual-end')
export const ready = true
export const value = helper + 40
export let count = 0
export function inc() {
  return ++count
}
export const marker = {}
export const manualOnly = true
export default function read() {
  return value
}
