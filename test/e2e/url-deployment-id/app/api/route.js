import imported from '../../public/test.png'
const url = new URL('../../public/test.png', import.meta.url).toString()

export function GET() {
  return Response.json({ imported, url })
}
