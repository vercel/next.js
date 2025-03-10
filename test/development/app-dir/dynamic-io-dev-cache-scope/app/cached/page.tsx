import {
  unstable_expireTag,
  unstable_cacheLife as cacheLife,
  unstable_cacheTag,
} from 'next/cache'
import { fetchData } from '../api/data'
// import { Suspense } from 'react'
// import { cookies, headers } from 'next/headers'

function InnerComponent({ children }) {
  return <span id="value">{children}</span>
}

async function refresh() {
  'use server'
  unstable_expireTag('hello')
}

async function reload() {
  'use server'
}

async function Component() {
  'use cache'
  cacheLife({ revalidate: 30 })
  unstable_cacheTag('hello')
  return <InnerComponent>{await fetchData()}</InnerComponent>
}

export default async function Home() {
  return (
    <>
      <form action={refresh}>
        <button id="refresh">Refresh</button>
      </form>
      <form action={reload}>
        <button id="reload">Reload</button>
      </form>
      <Component />
    </>
  )
}
