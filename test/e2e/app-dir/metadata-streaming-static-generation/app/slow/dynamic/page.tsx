import { connection } from 'next/server'

export default function Page() {
  return <p>slow dynamic</p>
}

export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 3 * 1000))
  return {
    title: 'slow page - dynamic',
  }
}
