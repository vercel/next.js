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

export default async function Page({ params }) {
  const data = await fetch(
    `http://localhost:${process.env.TEST_SERVER_PORT}`
  ).then((res) => res.text())

  return (
    <>
      <p>hello world</p>
      <p id="data">{data}</p>
    </>
  )
}
