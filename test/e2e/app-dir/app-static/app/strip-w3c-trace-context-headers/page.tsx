export default async function Page() {
  const traceparent1 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: { traceparent: 'A' },
      next: { revalidate: 50 },
    }
  ).then((res) => res.text())

  const traceparent2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: { traceparent: 'B' },
      next: { revalidate: 50 },
    }
  ).then((res) => res.text())

  const tracestate1 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: { tracestate: 'B' },
      next: { revalidate: 50 },
    }
  ).then((res) => res.text())

  const tracestate2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: { tracestate: 'B' },
      next: { revalidate: 50 },
    }
  ).then((res) => res.text())

  const echoedHeaders = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/echo-headers',
    {
      headers: { traceparent: 'A', tracestate: 'A' },
      next: { revalidate: 50 },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="traceparent1">{traceparent1}</p>
      <p id="traceparent2">{traceparent2}</p>
      <p id="tracestate1">{tracestate1}</p>
      <p id="tracestate2">{tracestate2}</p>
      <p id="echoedHeaders">{echoedHeaders}</p>
    </>
  )
}
