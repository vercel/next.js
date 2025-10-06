import * as React from 'react'
import Form from 'next/form'

export default function Home() {
  return (
    <Form action="/pages-dir/" id="search-form">
      <input name="query" />
      <button type="submit" formAction="/pages-dir/search">
        Submit
      </button>
    </Form>
  )
}
