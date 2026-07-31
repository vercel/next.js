import { Suspense } from 'react'
import { connection } from 'next/server'

async function getProduct() {
  'use cache'
  return {
    name: 'Product',
    // Padded so the resume-cache JSON is comfortably above the
    // `maxPostponedStateSize * 5 = 250 B` decompressed ceiling.
    description: 'x'.repeat(4096),
  }
}

async function Dynamic() {
  await connection()
  return <p data-testid="dynamic">dynamic part rendered at request time</p>
}

export default async function Page() {
  const product = await getProduct()
  return (
    <main>
      <h1 data-testid="name">{product.name}</h1>
      <p data-testid="description">{product.description}</p>
      <Suspense fallback={<p data-testid="fallback">loading…</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
