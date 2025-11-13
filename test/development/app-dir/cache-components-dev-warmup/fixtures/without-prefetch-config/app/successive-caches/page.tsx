export default async function Page() {
  return (
    <main>
      <h1>Warmup Dev Renders - deep successive cache reads</h1>
      <One />
    </main>
  )
}

async function One() {
  const cache1 = await fastCache()
  console.log('after cache 1')
  return <Two cache1={cache1} />
}

async function Two({ cache1 }) {
  const cache2 = await slowCache(1)
  console.log('after cache 2')
  return <Three cache1={cache1} cache2={cache2} />
}

async function Three({ cache1, cache2 }) {
  console.log('after caches 1 and 2')
  const cache3 = await slowCache(2)
  console.log('after cache 3')
  return (
    <div>
      <div>Cache 1: {cache1}</div>
      <div>Cache 2: {cache2}</div>
      <div>Cache 3: {cache3}</div>
    </div>
  )
}

async function fastCache() {
  'use cache'
  return Math.random()
}

async function slowCache(_key: number) {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve))
  return Math.random()
}
