import imported from '../public/vercel.png'
const url = new URL('../public/vercel.png', import.meta.url).toString()

export const contentType = 'text/json'

// Image generation
export default async function Image() {
  return Response.json({ imported, url })
}
