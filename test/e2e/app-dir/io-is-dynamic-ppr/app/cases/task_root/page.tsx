export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page renders a component that requires async IO. It is simulated
        using setTimeout(f, 0). We expect this page to not produce any static
        shell because there is no Suspense boundary above this dynamic IO
      </p>
      <ComponentWithIO />
      <div id="page">{process.env.__TEST_SENTINEL}</div>
    </>
  )
}

async function ComponentWithIO() {
  await new Promise<void>((r) => setTimeout(r, 0))
  return <p>hello IO</p>
}
