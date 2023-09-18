import 'server-only'

export default function handler() {
  return new Response('api/hello-edge.js:' + sharedComponentValue)
}

export const runtime = 'edge'
