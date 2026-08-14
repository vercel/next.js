import { connection } from 'next/server'

export async function generateViewport() {
  await connection()
  throw new Error('viewport failed')
}

export default function Page() {
  return <main id="viewport-page">Viewport page</main>
}
