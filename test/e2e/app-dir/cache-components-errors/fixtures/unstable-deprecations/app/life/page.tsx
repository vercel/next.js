import { unstable_cacheLife, cacheLife } from 'next/cache'

export default async function Page() {
  const stable = await stableLife()
  const unstable1 = await unstableLife1()
  const unstable2 = await unstableLife2()
  return (
    <>
      <div>
        This page calls a "use cache" function that uses the unstable_cacheLife
        API twice. We expect to see a warning once per server lifetime when
        using unstable_cacheLife.
      </div>
      <div>{stable}</div>
      <div>{unstable1}</div>
      <div>{unstable2}</div>
    </>
  )
}

async function unstableLife1() {
  'use cache'
  unstable_cacheLife('minutes')
  return Math.random()
}

async function unstableLife2() {
  'use cache'
  unstable_cacheLife('minutes')
  return Math.random()
}

async function stableLife() {
  'use cache'
  cacheLife('minutes')
  return Math.random()
}
