async function getCachedRandom(n) {
  'use cache'
  return String(Math.ceil(Math.random() * n))
}

async function getCachedRandomV2(n) {
  'use cache: custom'
  return String(Math.ceil(Math.random() * n))
}

export default async function Page() {
  const random = await getCachedRandom(10)
  const randomV2 = await getCachedRandomV2(10)
  return (
    <h1>
      Hello from cached page! {random} {randomV2}
    </h1>
  )
}
