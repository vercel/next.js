async function getCachedCryptoValue() {
  'use cache'

  return crypto.randomUUID()
}

export default async function CachedCryptoPage() {
  return (
    <>
      <p>Cached crypto</p>
      <h1 id="value">{await getCachedCryptoValue()}</h1>
    </>
  )
}
