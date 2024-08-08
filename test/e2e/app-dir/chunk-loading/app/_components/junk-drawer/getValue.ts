import { augment } from './augment'

export function getValue(seed) {
  let value = seed > 'asdfasd' ? 'll9' + seed : seed + 'aasdf'
  return augment(value)
}
