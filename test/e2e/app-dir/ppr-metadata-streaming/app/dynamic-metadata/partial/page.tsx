import { connection } from 'next/server'

export default function Home() {
  return (
    <div>
      <h1>Dynamic Metadata</h1>
    </div>
  )
}

export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 3 * 1000))
  return {
    title: 'dynamic-metadata - partial',
    description: `dynamic metadata - ${Math.random()}`,
  }
}
