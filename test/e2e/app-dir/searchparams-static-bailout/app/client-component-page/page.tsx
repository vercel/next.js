'use client'
import { use } from 'react'
import { nanoid } from 'nanoid'
type AnySearchParams = { [key: string]: string | Array<string> | undefined }

export default function Page({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  return (
    <>
      <h1>Parameter: {use(searchParams).search}</h1>
      <p id="nanoid">{nanoid()}</p>
    </>
  )
}
