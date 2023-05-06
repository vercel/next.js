import Link from 'next/link'
import { use } from 'react'

async function getData() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return {
    a: 'b',
  }
}

export function generateStaticParams() {
  return [{ id: 'static' }]
}

export default function IdPage({ params }) {
  const data = use(getData())
  console.log(data)

  if (params.id === '123') {
    return (
      <>
        IdPage: {params.id}
        <Link href="/dashboard/456">To 456</Link>
      </>
    )
  }

  return (
    <>
      IdPage: {params.id}
      <Link href="/dashboard/123">To 123</Link>
    </>
  )
}
//
