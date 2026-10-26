import * as React from 'react'
import Form from 'next/form'

export default function Home() {
  return (
    <Form action="/pages-dir/search" id="search-form">
      <textarea name="query" defaultValue={'line1\nline2'} />
      <button type="submit">Submit</button>
    </Form>
  )
}
