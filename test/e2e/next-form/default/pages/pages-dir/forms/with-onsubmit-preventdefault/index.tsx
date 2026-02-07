'use client'
import * as React from 'react'
import Form from 'next/form'
import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()
  return (
    <Form
      action="/pages-dir/search"
      id="search-form"
      onSubmit={(e) => {
        e.preventDefault()
        // `preventDefault()` should stop <Form> from running its navigation logic.
        // if it doesn't (which'd be a bug), <Form> would call a `router.push` after this,
        // and the last push wins, so this would be ignored.
        router.push('/pages-dir/redirected-from-action')
      }}
    >
      <input name="query" />
      <button type="submit">Submit</button>
    </Form>
  )
}
