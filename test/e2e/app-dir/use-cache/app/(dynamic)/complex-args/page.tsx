async function getCached({ p }) {
  'use cache'
  const array = await p
  if (array instanceof Uint8Array) {
    return array[0].toString(16) + '-' + Math.random()
  }
  return 'invalid'
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n: string }>
}) {
  const n = parseInt((await searchParams).n, 16)
  const p = Promise.resolve(new Uint8Array([n]))
  return <p id="x">{await getCached({ p })}</p>
}
