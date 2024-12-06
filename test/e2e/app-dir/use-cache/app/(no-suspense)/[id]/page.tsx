async function getCachedRandom(n: number) {
  'use cache'
  return String(Math.ceil(Math.random() * n))
}

export async function generateStaticParams() {
  return [{ id: await getCachedRandom(10) }, { id: await getCachedRandom(2) }]
}

export default async function Page() {
  return 'hit'
}
