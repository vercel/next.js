import { fetchRetry } from '../../../lib/fetch-retry'

export const runtime = 'edge'

async function EmptyBodiesOne() {
  // We expect the same cache key so we're doing these in pairs
  // 3 or more requests will start to get a miss due to too low revalidation time
  const dataWithBody1 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      next: {
        revalidate: 10,
      },
      body: '',
    }
  ).then((res) => res.text())
  const dataWithBody2 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      next: {
        revalidate: 10,
      },
      body: new FormData(),
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="data-empty-body1">{dataWithBody1}</p>
      <p id="data-empty-body2">{dataWithBody2}</p>
    </>
  )
}

async function EmptyBodiesTwo() {
  const dataWithBody1 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      next: {
        revalidate: 10,
      },
      body: '',
    }
  ).then((res) => res.text())
  const dataWithBody2 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      next: {
        revalidate: 10,
      },
      body: new URLSearchParams(),
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="data-empty-body3">{dataWithBody1}</p>
      <p id="data-empty-body4">{dataWithBody2}</p>
    </>
  )
}

function EmptyBodies() {
  return (
    <>
      <EmptyBodiesOne />
      <EmptyBodiesTwo />
    </>
  )
}

async function IterableBodies() {
  const entries = [
    ['myParam', 'myValue'],
    ['myParam', 'anotherValue'],
  ]
  const urlSearchParams = new URLSearchParams(entries)
  const formData = new FormData()
  entries.forEach(([key, value]) => formData.append(key, value))

  const dataWithBody1 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      next: {
        revalidate: 10,
      },
      body: urlSearchParams,
    }
  ).then((res) => res.text())

  const dataWithBody2 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      next: {
        revalidate: 10,
      },
      body: formData,
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="data-iterable-body1">{dataWithBody1}</p>
      <p id="data-iterable-body2">{dataWithBody2}</p>
    </>
  )
}

async function DataBodies() {
  const data = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      next: {
        revalidate: 10,
      },
    }
  ).then((res) => res.text())

  const dataWithBody1 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      next: {
        revalidate: 10,
      },
    }
  ).then((res) => res.text())

  const dataWithBody2 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(JSON.stringify({ another: 'one' }))
          controller.close()
        },
      }),
      duplex: 'half',
      next: {
        revalidate: 10,
      },
    }
  ).then((res) => res.text())

  const dataWithBody3 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      body: new URLSearchParams('myParam=myValue&myParam=anotherValue'),
      next: {
        revalidate: 30,
      },
    }
  ).then((res) => res.text())

  const dataWithBody4 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      body: new URLSearchParams('myParam=myValue&myParam=diffValue'),
      next: {
        revalidate: 30,
      },
    }
  ).then((res) => res.text())

  const dataWithBody5 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      body: new TextEncoder().encode(JSON.stringify({ hi: 'there' })),
      next: {
        revalidate: 30,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page-data">{data}</p>
      <p id="data-body1">{dataWithBody1}</p>
      <p id="data-body2">{dataWithBody2}</p>
      <p id="data-body3">{dataWithBody3}</p>
      <p id="data-body4">{dataWithBody4}</p>
      <p id="data-body5">{dataWithBody5}</p>
    </>
  )
}

export default function Page() {
  return (
    <>
      <p id="page">/variable-revalidate/post-method-cached</p>
      <DataBodies />
      <EmptyBodies />
      <IterableBodies />
    </>
  )
}
