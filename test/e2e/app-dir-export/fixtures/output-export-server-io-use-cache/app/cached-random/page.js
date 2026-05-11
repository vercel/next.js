async function getCachedRandom() {
  'use cache'

  return Math.random()
}

export default async function CachedRandomPage() {
  return (
    <>
      <p>Cached random</p>
      <h1 id="value">{String(await getCachedRandom())}</h1>
    </>
  )
}
