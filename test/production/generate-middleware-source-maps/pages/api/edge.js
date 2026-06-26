export const config = { runtime: 'edge' }
export default function (req) {
  return new Response('Hello from ' + req.url)
}
