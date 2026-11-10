import { Suspense } from 'react'
import { fetchRetry } from '../../../lib/fetch-retry'
import { connection } from 'next/server'

async function EmptyBodies() {
  const dataWithBody1 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      next: {
        revalidate: 3600,
        tags: ['variable-revalidate-edge-post-method-iterable'],
      },
      body: '',
    }
  ).then((res) => res.text())
  const dataWithBody2 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      next: {
        revalidate: 3600,
        tags: ['variable-revalidate-edge-post-method-iterable'],
      },
      body: new URLSearchParams(),
    }
  ).then((res) => res.text())
  const dataWithBody3 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      next: {
        revalidate: 3600,
        tags: ['variable-revalidate-edge-post-method-iterable'],
      },
      body: new FormData(),
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="data-empty-body1">{dataWithBody1}</p>
      <p id="data-empty-body2">{dataWithBody2}</p>
      <p id="data-empty-body3">{dataWithBody3}</p>
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
        revalidate: 3600,
        tags: ['variable-revalidate-edge-post-method-iterable'],
      },
      body: urlSearchParams,
    }
  ).then((res) => res.text())

  const dataWithBody2 = await fetchRetry(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
      next: {
        revalidate: 3600,
        tags: ['variable-revalidate-edge-post-method-iterable'],
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

async function Dynamic({ children }) {
  await connection()

  return children
}

export default function Page() {
  return (
    <>
      <p id="page">/variable-revalidate/post-method-iterable</p>
      <Suspense fallback={<p>Getting fresh data</p>}>
        <Dynamic>
          <EmptyBodies />
          <IterableBodies />
        </Dynamic>
      </Suspense>
    </>
  )
}
