import 'server-only'

export default function handler() {
  return new Response('api/hello-edge.js')
}

export const runtime = 'edge'
