'use client'

import { use } from 'react'

export default function ClientComponent({
  searchParams,
}: {
  searchParams: Promise<any>
}) {
  return (
    <>
      <h1>Parameter: {use(searchParams).search}</h1>
    </>
  )
}
