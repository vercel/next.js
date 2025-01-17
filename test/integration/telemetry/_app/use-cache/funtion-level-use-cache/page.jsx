async function getCachedRandom(n) {
  'use cache'
  return String(Math.ceil(Math.random() * n))
}

export default async function Page() {
  const random = await getCachedRandom(10)
  return <h1>Hello from cached page! {random}</h1>
}
