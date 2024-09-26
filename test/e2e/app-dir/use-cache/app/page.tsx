import { Foo } from './client'

async function getCachedRandom(x: number) {
  'use cache'
  return {
    x,
    y: Math.random(),
    z: <Foo />,
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n: string }>
}) {
  const n = +(await searchParams).n
  const values = await getCachedRandom(n)
  return (
    <>
      <p id="x">{values.x}</p>
      <p id="y">{values.y}</p>
      <p id="z">{values.z}</p>
    </>
  )
}
