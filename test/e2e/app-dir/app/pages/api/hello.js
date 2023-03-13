export default function api(req) {
  return new Response('hello')
}

export const config = {
  runtime: 'edge',
}
