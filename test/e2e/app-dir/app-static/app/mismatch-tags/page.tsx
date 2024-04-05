export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      next: { tags: ['thankyounext'] },
    }
  ).then((res) => res.text())

  console.log('[bruh] data =', data)

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      next: { tags: ['thankyounext', 'justputit'] },
    }
  ).then((res) => res.text())

  console.log('[bruh] data2 =', data2)

  return (
    <>
      <p id="page-data">data: {data}</p>
      <p id="page-data-2">data: {data2}</p>
    </>
  )
}
