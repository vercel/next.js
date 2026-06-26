'use client'
import * as React from 'react'
import { useActionState, useState } from 'react'
import Form from 'next/form'
import { useRouter } from 'next/navigation'

export default function Page() {
  const destination = '/redirected-from-action'
  const router = useRouter()
  const [, dispatch] = useActionState(() => {
    const to = destination + '?' + new URLSearchParams({ query })
    router.push(to)
  }, undefined)

  const [query, setQuery] = useState('')
  return (
    <Form action={dispatch} id="search-form">
      <input
        name="query"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <button type="submit">Submit (client action)</button>
    </Form>
  )
}
