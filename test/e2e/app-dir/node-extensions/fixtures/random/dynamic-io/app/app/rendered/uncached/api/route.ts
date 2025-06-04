import { connection } from 'next/server'

export async function GET() {
  await connection()
  const response = JSON.stringify({
    rand1: Math.random(),
    rand2: Math.random(),
  })
  return new Response(response, {
    headers: {
      'content-type': 'application/json',
    },
  })
}
