import { connection } from 'next/server'

export async function GET() {
  await connection()

  return new Response('dynamic favicon', {
    headers: {
      'content-type': 'image/x-icon',
    },
  })
}
