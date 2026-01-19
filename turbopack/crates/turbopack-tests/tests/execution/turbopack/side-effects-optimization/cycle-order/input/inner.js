import { value } from './module.js'
export const something = 'inner'
let throws = false
try {
  value
} catch {
  throws = true
}
;(globalThis.order ??= []).push(`inner ${throws ? 'throws' : 'no-throws'}`)
