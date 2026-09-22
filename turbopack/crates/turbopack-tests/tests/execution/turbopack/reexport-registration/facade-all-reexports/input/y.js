import { order } from './order'

order.push('y')

export const frozen = Object.freeze({ label: 'frozen' })
export let y = 'y'
export function setY(value) {
  y = value
}
