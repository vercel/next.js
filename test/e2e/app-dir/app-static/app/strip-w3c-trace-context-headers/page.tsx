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

  const invocationResults = [] as any[]
  for (const header of ['x-vercel-id', 'x-invocation-id']) {
    for (const useHeaders of [false, true]) {
      const url = `https://next-data-api-endpoint.vercel.app/api/random?app-static-invocation-headers=${header}-${useHeaders}`
      const headers: Headers | Record<string, string> = useHeaders
        ? new Headers()
        : {}
      const setHeader = (name: string, value: string) => {
        if (headers instanceof Headers) {
          headers.set(name, value)
        } else {
          headers[name] = value
        }
      }
      const getData = () =>
        fetch(url, { headers, next: { revalidate: 50 } }).then((res) =>
          res.text()
        )

      const baseline = await getData()
      setHeader(header, 'A')
      const first = await getData()
      setHeader(header, 'B')
      const second = await getData()
      setHeader('x-cache-variant', 'different')
      const variant = await getData()
      invocationResults.push({
        header,
        useHeaders,
        baseline,
        first,
        second,
        variant,
      })
    }
  }

  return (
    <>
      <p id="traceparent1">{traceparent1}</p>
      <p id="traceparent2">{traceparent2}</p>
      <p id="tracestate1">{tracestate1}</p>
      <p id="tracestate2">{tracestate2}</p>
      <p id="echoedHeaders">{echoedHeaders}</p>
      <p id="invocationResults">{JSON.stringify(invocationResults)}</p>
    </>
  )
}
