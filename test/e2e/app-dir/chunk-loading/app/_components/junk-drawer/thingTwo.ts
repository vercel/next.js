import { getValue } from './getValue'

export function thingTwo() {
  let x = ((Math.random() * 100000) | 0).toString(16)
  console.log('thingTwo', getValue(x))
}
