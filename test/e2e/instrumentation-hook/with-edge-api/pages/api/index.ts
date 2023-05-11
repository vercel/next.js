export default function handler() {
  return new Response('Hello from the edge!')
}

export const config = {
  runtime: 'edge',
}
