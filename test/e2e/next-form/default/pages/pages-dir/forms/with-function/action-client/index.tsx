'use client'
import * as React from 'react'
import Form from 'next/form'
import { useRouter } from 'next/router'

const isReact18 = typeof getUseActionState() !== 'function'

// `useActionState` only exists in React 19. Read it through `Reflect.get`
// rather than `React.useActionState`: Rspack treats a static reference to a
// missing export as a build error, which would fail the build under React 18
// even though this page is never used there.
function getUseActionState(): typeof React.useActionState {
  return Reflect.get(React, 'useActionState')
}

export default isReact18 ? DummyPage : Page

function DummyPage() {
  return <>This test cannot run in React 18</>
}

function Page() {
  const destination = '/pages-dir/redirected-from-action'
  const router = useRouter()
  const useActionState = getUseActionState()
  const [, dispatch] = useActionState(() => {
    const to = destination + '?' + new URLSearchParams({ query })
    router.push(to)
  }, undefined)

  const [query, setQuery] = React.useState('')
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
