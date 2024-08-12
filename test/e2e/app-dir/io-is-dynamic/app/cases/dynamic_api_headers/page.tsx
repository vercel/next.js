import { headers } from 'next/headers'

export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page calls `headers()` in a child component. Even though the page
        doesn't do any IO it should still bail out of static generation.
      </p>
      <ComponentOne />
      <ComponentTwo />
    </>
  )
}

async function ComponentOne() {
  try {
    headers()
  } catch (e) {
    // swallow any throw. We should still not be static
  }
  return <div>This component read headers</div>
}

async function ComponentTwo() {
  return <div>This component didn't read headers</div>
}
