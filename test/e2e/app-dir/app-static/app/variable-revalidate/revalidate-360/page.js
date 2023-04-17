export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?page',
    {
      next: { revalidate: 360, tags: ['thankyounext'] },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?a=b',
    {
      next: { revalidate: 360, tags: ['thankyounext', 'justputit'] },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/variable-revalidate/revalidate-360</p>
      <p id="page-data">revalidate 360 (tags: thankyounext): {data}</p>
      <p id="page-data2">
        revalidate 360 (tags: thankyounext, justputit): {data2}
      </p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
