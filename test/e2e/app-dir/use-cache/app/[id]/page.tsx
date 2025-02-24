async function getCachedRandom(n: number) {
  'use cache'
  return String(Math.ceil(Math.random() * n))
}

export async function generateStaticParams() {
  return [
    { id: `a${await getCachedRandom(9)}` },
    { id: `b${await getCachedRandom(2)}` },
  ]
}

export default async function Page() {
  return 'hit'
}
