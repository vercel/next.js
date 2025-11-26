'use client'
import * as React from 'react'
import Form from 'next/form'
import { useRouter } from 'next/router'

const isReact18 = typeof React.useActionState !== 'function'

export default isReact18 ? DummyPage : Page

function DummyPage() {
  return <>This test cannot run in React 18</>
}

function Page() {
  const destination = '/pages-dir/redirected-from-action'
  const [query, setQuery] = React.useState('')
  return (
    <Form action="/pages-dir/search" id="search-form">
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
}: { to: string } & React.ComponentProps<'button'>) {
  const router = useRouter()
  const [, dispatch] = React.useActionState(() => {
    router.push(to)
  }, undefined)
  return <button type="submit" formAction={dispatch} {...props} />
}
