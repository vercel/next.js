export default async function Page({ searchParams }) {
  await 1
  return (
    <>
      <p>
        This page reads `searchParams.foo` in a child component. Even though the
        page doesn't do any IO it should still bail out of static generation.
      </p>
      <ComponentOne searchParams={searchParams} />
      <ComponentTwo />
    </>
  )
}

async function ComponentOne({ searchParams }) {
  try {
    void searchParams.foo
  } catch (e) {
    // swallow any throw. We should still not be static
  }
  return <div>This component accessed `searchParams.foo`</div>
}

async function ComponentTwo() {
  return <div>This component didn't access any searchParams properties</div>
}
