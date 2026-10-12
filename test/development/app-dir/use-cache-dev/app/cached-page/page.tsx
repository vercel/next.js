async function getCachedData() {
  'use cache'

  return { text: 'foo', mathRandom: Math.random() }
}

export default async function Page() {
  const { text, mathRandom } = await getCachedData()

  // Read outside of "use cache" so it reflects the recompiled module on every
  // request. This lets the test distinguish a stale cache hit (where `text`
  // keeps its old value) from the module never having recompiled at all.
  const uncachedText = 'foo'

  return (
    <div id="container">
      <span id="text">{text}</span>
      <span id="mathRandom">{mathRandom}</span>
      <span id="uncachedText">{uncachedText}</span>
    </div>
  )
}
