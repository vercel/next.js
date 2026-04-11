async function getCachedTime() {
  'use cache'

  return Date.now()
}

export default async function CachedTimePage() {
  return (
    <>
      <p>Cached time</p>
      <h1 id="value">{String(await getCachedTime())}</h1>
    </>
  )
}
