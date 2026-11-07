import { Suspense } from 'react'
import { connection } from 'next/server'
import { createControl, inYoungGeneration } from '../lib/in-young-generation'

async function Dynamic() {
  await connection()
  const handlers = globalThis as unknown as {
    __next_require__: object
    __next_chunk_load__: object
  }
  return (
    <p>
      {[
        `control:${inYoungGeneration(createControl())}`,
        `require:${inYoungGeneration(handlers.__next_require__)}`,
        `loadChunk:${inYoungGeneration(handlers.__next_chunk_load__)}`,
      ].join(' ')}
    </p>
  )
}

export default function Page() {
  return (
    <Suspense>
      <Dynamic />
    </Suspense>
  )
}
