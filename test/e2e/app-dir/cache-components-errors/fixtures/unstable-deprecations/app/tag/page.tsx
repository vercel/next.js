import { unstable_cacheTag, cacheTag } from 'next/cache'

export default async function Page() {
  const stable = await stableTag()
  const unstable1 = await unstableTag1()
  const unstable2 = await unstableTag2()
  return (
    <>
      <div>
        This page calls a "use cache" function that uses the unstable_cacheTag
        API twice. We expect to see a warning once per server lifetime when
        using unstable_cacheTag.
      </div>
      <div>{stable}</div>
      <div>{unstable1}</div>
      <div>{unstable2}</div>
    </>
  )
}

async function unstableTag1() {
  'use cache'
  unstable_cacheTag('tag')
  return Math.random()
}

async function unstableTag2() {
  'use cache'
  unstable_cacheTag('tag')
  return Math.random()
}

async function stableTag() {
  'use cache'
  cacheTag('tag')
  return Math.random()
}
