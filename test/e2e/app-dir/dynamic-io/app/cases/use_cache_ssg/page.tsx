'use cache'

async function cachedValue() {
  'use cache'
  return Math.random()
}

export default async function Page() {
  const value = await cachedValue()
  return <div id="value">{value}</div>
}
