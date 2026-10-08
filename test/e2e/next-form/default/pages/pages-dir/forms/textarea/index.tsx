import * as React from 'react'
import Form from 'next/form'

function HydrationMarker() {
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => setHydrated(true), [])

  return hydrated ? <span id="hydrated">true</span> : null
}

export default function Page() {
  return (
    <>
      <HydrationMarker />
      <Form action="/pages-dir/search" id="next-form">
        <textarea name="query" defaultValue={'line1\nline2'} />
        <button type="submit">Submit</button>
      </Form>
      <form action="/pages-dir/search" id="native-form">
        <textarea name="query" defaultValue={'line1\nline2'} />
        <button type="submit">Submit</button>
      </form>
    </>
  )
}
