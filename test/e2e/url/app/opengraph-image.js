import imported from '../public/vercel.png'
const url = new URL('../public/vercel.png', import.meta.url).toString()

export const contentType = 'application/json'

// Image generation
export default async function Image() {
  return new Response(JSON.stringify({ imported: imported.src, url }), {
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
