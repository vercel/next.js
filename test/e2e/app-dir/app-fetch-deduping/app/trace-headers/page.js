async function getData() {
  const responses = await Promise.all([
    fetch(`http://localhost:${process.env.TEST_SERVER_PORT}`, {
      headers: {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        tracestate: 'vendor1=value1',
      },
    }).then((res) => res.text()),
    fetch(`http://localhost:${process.env.TEST_SERVER_PORT}`, {
      headers: {
        traceparent: '00-1af7651916cd43dd8448eb211c80319c-c7ad6b7169203332-01',
        tracestate: 'vendor2=value2',
      },
    }).then((res) => res.text()),
    fetch(`http://localhost:${process.env.TEST_SERVER_PORT}`, {
      headers: {
        traceparent: '00-2af7651916cd43dd8448eb211c80319c-d7ad6b7169203333-01',
        tracestate: 'vendor3=value3',
      },
    }).then((res) => res.text()),
  ])

  return responses
}

export default async function StaticTracePage() {
  const data = await getData()

  return (
    <div>
      <h1>Static Page with Trace Headers</h1>
      <p>All responses should have the same data due to deduplication:</p>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}
