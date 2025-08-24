// This page is validating that despite multiple unsuccessful responses to the same, potentially cached URLs,
// the build locks are resolved and the page is still built successfully.
export async function generateStaticParams() {
  return [
    {
      slug: 'slug-0',
    },
    {
      slug: 'slug-1',
    },
    {
      slug: 'slug-2',
    },
    {
      slug: 'slug-3',
    },
    {
      slug: 'slug-4',
    },
  ]
}

export default async function Page() {
  const data = await fetch(
    `http://localhost:${process.env.TEST_SERVER_PORT}?status=404`
  ).then((res) => res.text())
  await fetch(
    `http://localhost:${process.env.TEST_SERVER_PORT}?status=404`
  ).then((res) => res.text())

  return (
    <>
      <p>hello world</p>
      <p id="data">{data}</p>
    </>
  )
}
