import imported from '../../../public/vercel.png'
const url = new URL('../../../public/vercel.png', import.meta.url).toString()

export function GET(req, res) {
  return Response.json({ imported, url })
}

export const runtime = 'edge'
