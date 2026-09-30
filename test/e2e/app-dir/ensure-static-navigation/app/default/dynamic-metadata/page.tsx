import type { Metadata } from 'next'
import { connection } from 'next/server'

export const unstable_ensureStatic = 'navigation'

export async function generateMetadata(): Promise<Metadata> {
  await connection()
  return {
    title: 'Dynamic title',
  }
}

export default function Page() {
  return (
    <main>
      <p>This page has a dynamic generateMetadata</p>
    </main>
  )
}
