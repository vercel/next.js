export default async function Page() {
  const data1 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: { traceparent: 'A' },
      next: { revalidate: 50 },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: { traceparent: 'B' },
      next: { revalidate: 50 },
    }
  ).then((res) => res.text())

  const echoedHeaders = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/echo-headers',
    {
      headers: { traceparent: 'C' },
      next: { revalidate: 50 },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="data1">{data1}</p>
      <p id="data2">{data2}</p>
      <p id="echoedHeaders">{echoedHeaders}</p>
    </>
  )
}
