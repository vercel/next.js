export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      next: {
        tags: ['thankyounext'],
      },
    }
  ).then((res) => res.text())

  return (
    <>
      Data:
      <div id="data-value">{data}</div>
    </>
  )
}
