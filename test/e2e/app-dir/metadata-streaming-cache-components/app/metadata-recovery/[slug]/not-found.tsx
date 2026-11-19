import { connection } from 'next/server'

export async function generateMetadata() {
  await connection()
  return {
    title: 'recovery metadata title',
    description: 'metadata from the recovery boundary',
  }
}

export default function NotFound() {
  return <p>recovery boundary content</p>
}
