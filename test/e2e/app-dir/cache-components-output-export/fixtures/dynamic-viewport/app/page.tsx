import { connection } from 'next/server'

export async function generateViewport() {
  await connection()
  return { themeColor: '#000000' }
}

export default function Page() {
  return <p>static body</p>
}
