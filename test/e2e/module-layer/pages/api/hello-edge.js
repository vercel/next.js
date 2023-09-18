import 'server-only'

export default function handler() {
  return new Response('pages/api/hello-edge.js:')
}

export const runtime = 'edge'
