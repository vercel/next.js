import { Suspense } from 'react'
import { type ComponentSeed, testData } from '../testdata'
import { AsyncComponentCard } from './component-card'

export const dynamic = 'force-dynamic'
const CHUNK_SIZE = 50

function CardFallback({ item }: { item: ComponentSeed }) {
  return (
    <article data-id={item.id}>
      <h2>loading-{item.id}</h2>
      <p>{item.group}</p>
      <ul>
        <li>loading</li>
        <li>loading</li>
      </ul>
    </article>
  )
}

function ChunkFallback({ chunk }: { chunk: ComponentSeed[] }) {
  return (
    <>
      {chunk.map((item) => (
        <CardFallback key={item.id} item={item} />
      ))}
    </>
  )
}

function chunkItems(items: ComponentSeed[]) {
  const chunks: ComponentSeed[][] = []
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    chunks.push(items.slice(i, i + CHUNK_SIZE))
  }
  return chunks
}

function CardChunk({ chunk }: { chunk: ComponentSeed[] }) {
  return (
    <>
      {chunk.map((item) => (
        <Suspense key={item.id} fallback={<CardFallback item={item} />}>
          <AsyncComponentCard id={item.id} />
        </Suspense>
      ))}
    </>
  )
}

export default function App() {
  const items = testData()
  const chunks = chunkItems(items)

  return (
    <main>
      <section>
        {chunks.map((chunk) => (
          <Suspense
            key={chunk[0].id}
            fallback={<ChunkFallback chunk={chunk} />}
          >
            <CardChunk chunk={chunk} />
          </Suspense>
        ))}
      </section>
    </main>
  )
}
