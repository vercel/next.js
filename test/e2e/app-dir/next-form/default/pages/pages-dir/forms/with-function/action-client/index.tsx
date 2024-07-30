'use client'
import * as React from 'react'
import { useActionState, useState } from 'react'
import Form from 'next/form'
import { useRouter } from 'next/router'

export default function Page() {
  const destination = '/pages-dir/redirected-from-action'
  const router = useRouter()
  const [, dispatch] = useActionState(() => {
    const to = destination + '?' + new URLSearchParams({ query })

    // TODO(lubieowoce): this doesn't work unless wrapped in a startTransition...
    //   return startTransition(() => {
    //     router.push(to)
    //   })
    // why is this necessary here?
    // without it, the URL updates, but we stay on the old page...
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
