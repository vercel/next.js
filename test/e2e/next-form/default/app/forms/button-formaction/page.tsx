import * as React from 'react'
import Form from 'next/form'

export default function Home() {
  return (
    <Form action="/" id="search-form">
      <input name="query" />
      <button type="submit" formAction="/search">
        Submit
      </button>
    </Form>
  )
}
