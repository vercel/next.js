import { unstable_noStore as noStore } from 'next/cache'

export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page calls `unstable_noStore()` in a child component. Even though
        the page doesn't do any IO it should still bail out of static
        generation.
      </p>
      <ComponentOne />
      <ComponentTwo />
    </>
  )
}

async function ComponentOne() {
  try {
    noStore()
  } catch (e) {
    // swallow any throw. We should still not be static
  }
  return (
    <div>
      This component called `unstable_noStore()` outside of a cache scope
    </div>
  )
}

async function ComponentTwo() {
  return <div>This component didn't call `unstable_noStore()`</div>
}
