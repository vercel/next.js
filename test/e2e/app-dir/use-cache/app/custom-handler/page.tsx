async function getCachedRandom(x: number, children: React.ReactNode) {
  'use cache: custom'
  return {
    x,
    y: Math.random(),
    r: children,
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n: string }>
}) {
  const n = +(await searchParams).n
  const values = await getCachedRandom(
    n,
    <p id="r">rnd{Math.random()}</p> // This should not invalidate the cache
  )
  return (
    <>
      <p id="x">{values.x}</p>
      <p id="y">{values.y}</p>
      {values.r}
    </>
  )
}
