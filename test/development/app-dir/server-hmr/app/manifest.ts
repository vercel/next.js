import { depEvaluatedAt, manifestVersion } from './manifest-dep'

let _hmrTrigger = 0
const manifestEvaluatedAt = Date.now()

export default function manifest() {
  return {
    name: manifestVersion,
    short_name: 'v0',
    start_url: '/',
    display: 'standalone',
    depEvaluatedAt,
    manifestEvaluatedAt,
  }
}
