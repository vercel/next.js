export { b } from './b-sync.js'
import { dep } from './dep-async.js'

export function a() {
  return 'a' + dep()
}
