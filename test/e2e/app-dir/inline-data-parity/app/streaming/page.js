import { Suspense } from 'react'

async function Slow() {
  await new Promise((resolve) => setTimeout(resolve, 300))
  return <section id="slow">slow content arrived</section>
}

export default function Page() {
  return (
    <main>
      <h1>streaming</h1>
      <Suspense fallback={<p id="fallback">loading…</p>}>
        <Slow />
      </Suspense>
    </main>
  )
}
