'use client'
export const dynamic = 'force-static'

export function generateStaticParams() {
  return [{ slug: 'use client should not fail build' }]
}

export default function Page({ params }) {
  return (
    <main>
      <h1>Use Client Example</h1>
      <p>{params.slug}</p>
    </main>
  )
}
