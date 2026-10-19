import { value } from './b.mjs'
export let name = 'first'
export const token = {}
export function updateName(value) {
  name = value
}
export const read = () => value
