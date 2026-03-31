import { updateTag } from 'next/cache'

export const fetchCache = 'default-cache'

async function AnotherRsc() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?another-no-cache',
    {
      cache: 'no-cache',
    }
  ).then((res) => res.text())

  return <p id="another-no-cache">"another-no-cache" {data}</p>
}

async function FirstRsc() {
  const dataNoCache = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?no-cache',
    {
      cache: 'no-cache',
    }
  ).then((res) => res.text())

  const dataForceCache = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?force-cache',
    {
      cache: 'force-cache',
    }
  ).then((res) => res.text())

  const dataRevalidate0 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?revalidate-0',
    {
      next: {
        revalidate: 0,
      },
    }
  ).then((res) => res.text())

  const dataRevalidateCache = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?revalidate-3',
    {
      next: {
        revalidate: 3,
      },
    }
  ).then((res) => res.text())

  const dataRevalidateAndFetchCache = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?revalidate-3-force-cache',
    {
      next: {
        revalidate: 3,
      },
      cache: 'force-cache',
    }
  ).then((res) => res.text())

  const dataAutoCache = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?auto-cache',
    { next: { tags: ['test-tag'] } }
  ).then((res) => res.text())

  return (
    <>
      <p id="data-no-cache">"cache: no-cache" {dataNoCache}</p>
      <p id="data-force-cache">"cache: force-cache" {dataForceCache}</p>
      <p id="data-revalidate-0">"revalidate: 0" {dataRevalidate0}</p>
      <p id="data-revalidate-cache">"revalidate: 3" {dataRevalidateCache}</p>
      <p id="data-revalidate-and-fetch-cache">
        "revalidate: 3 and cache: force-cache" {dataRevalidateAndFetchCache}
      </p>
      <p id="data-auto-cache">"auto cache" {dataAutoCache}</p>
    </>
  )
}

function RevalidateForm() {
  return (
    <form
      action={async () => {
        'use server'
        updateTag('test-tag')
      }}
    >
      <button id="revalidate-button">Revalidate</button>
    </form>
  )
}

export default async function Page() {
  return (
    <>
      <h1>Default Cache</h1>
      <FirstRsc />
      <AnotherRsc />
      <RevalidateForm />
    </>
  )
}
