'use client'

import React, { Suspense } from 'react'
import Form from 'next/form'

type AnySearchParams = Promise<{
  [key: string]: string | Array<string> | undefined
}>

function Home({ searchParams }: { searchParams: AnySearchParams }) {
  const attribute = React.use(searchParams).attribute
  return (
    <div
      onSubmit={(e) => {
        // should fire if the form let the event bubble up
        if (e.defaultPrevented) {
          console.log('incorrect: default submit behavior was prevented')
        } else {
          console.log('correct: default submit behavior was not prevented')
          e.preventDefault() // this submission will do something stupid, we don't want it to actually go through.
        }
      }}
    >
      <Form action="/search" id="search-form">
        <input name="query" />
        <button
          type="submit"
          formAction="/search"
          formEncType={
            attribute === 'formEncType' ? 'multipart/form-data' : undefined
          }
          formMethod={attribute === 'formMethod' ? 'post' : undefined}
          formTarget={attribute === 'formTarget' ? 'bloop' : undefined}
        >
          Submit
        </button>
      </Form>
    </div>
  )
}

export default function Page({
  searchParams,
}: {
  searchParams: AnySearchParams
}) {
  return (
    <Suspense fallback={<div>Page is loading...</div>}>
      <Home searchParams={searchParams} />
    </Suspense>
  )
}
