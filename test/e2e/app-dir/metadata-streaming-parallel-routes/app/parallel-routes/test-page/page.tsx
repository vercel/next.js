import { connection } from 'next/server'

export default function TestPage() {
  return 'test page'
}

export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return {
    title: `Dynamic api ${Math.random()}`,
  }
}
