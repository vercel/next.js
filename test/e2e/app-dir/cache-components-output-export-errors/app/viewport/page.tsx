import { connection } from 'next/server'

export async function generateViewport() {
  await connection()
  return { themeColor: 'blue' }
}

export default function Page() {
  return <p>Static body with dynamic viewport</p>
}
