'use client'
export default function Page({ searchParams }) {
  return (
    <>
      <p>
        This page reads `searchParams.foo` in a client component context. While
        the SSR'd page should not be
      </p>
      <ComponentOne searchParams={searchParams} />
      <ComponentTwo />
    </>
  )
}

function ComponentOne({ searchParams }) {
  try {
    void searchParams.foo
  } catch (e) {
    // swallow any throw. We should still not be static
  }
  return <div>This component accessed `searchParams.foo`</div>
}

function ComponentTwo() {
  return <div>This component didn't access any searchParams properties</div>
}
