import 'server-only'
import { sharedComponentValue } from '../../lib/mixed-lib'

export default function handler() {
  return new Response('api/hello-edge.js:' + sharedComponentValue)
}

export const runtime = 'edge'
