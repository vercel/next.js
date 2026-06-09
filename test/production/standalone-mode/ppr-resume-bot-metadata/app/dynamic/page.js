import { cookies } from 'next/headers'
import { connection } from 'next/server'

export async function generateMetadata() {
  // Dynamic metadata: resolved during the resume, not the prerender.
  await connection()

  return {
    title: 'dynamic-metadata-title',
  }
}

export default async function Page() {
  // Dynamic at the top level of the page (no Suspense boundary): the whole
  // segment, including the metadata slot rendered adjacent to it, is part of
  // the postponed hole instead of the static shell.
  const store = await cookies()

  return (
    <main>
      <p id="content">dynamic content {store.size}</p>
    </main>
  )
}
