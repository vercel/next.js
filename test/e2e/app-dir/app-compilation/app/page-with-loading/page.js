import { use } from 'react'

async function getData() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return {
    message: 'hello from slow page',
  }
}

export default function SlowPage() {
  const data = use(getData())

  return <h1 id="slow-page-message">{data.message}</h1>
}

export const dynamic = 'force-dynamic'
