export default function handler(req) {
  return new Response('Hello from api/pages-route-edge')
}

export const runtime = 'edge'
