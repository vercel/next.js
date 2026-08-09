export const runtime = 'edge'
export const dynamicParams = false

export default function Icon() {
  return new Response('This metadata route uses `export const runtime`.')
}
