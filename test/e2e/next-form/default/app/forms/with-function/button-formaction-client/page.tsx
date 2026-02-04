'use client'
import * as React from 'react'
import { type ComponentProps, useActionState, useState } from 'react'
import Form from 'next/form'
import { useRouter } from 'next/navigation'

export default function Page() {
  const destination = '/redirected-from-action'
  const [query, setQuery] = useState('')
  return (
    <Form action="/search" id="search-form">
      <input
        name="query"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <NavigateButton to={destination + '?' + new URLSearchParams({ query })}>
        Submit (client action)
      </NavigateButton>
    </Form>
  )
}

function NavigateButton({
  to,
  ...props
}: { to: string } & ComponentProps<'button'>) {
  const router = useRouter()
  const [, dispatch] = useActionState(() => router.push(to), undefined)
  return <button type="submit" formAction={dispatch} {...props} />
}
