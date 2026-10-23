import * as React from 'react'
import Form from 'next/form'
import HydrationMarker from './hydration-marker'

export default function Page() {
  return (
    <>
      <HydrationMarker />
      <Form action="/search" id="next-form">
        <textarea name="query" defaultValue={'line1\nline2'} />
        <button type="submit">Submit</button>
      </Form>
      <form action="/search" id="native-form">
        <textarea name="query" defaultValue={'line1\nline2'} />
        <button type="submit">Submit</button>
      </form>
    </>
  )
}
