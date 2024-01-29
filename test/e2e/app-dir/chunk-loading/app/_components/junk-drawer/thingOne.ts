import { augment } from './augment'

export function thingOne() {
  let x = ((Math.random() * 100000) | 0).toString(16)
  console.log('thingOne', augment(x))
}
