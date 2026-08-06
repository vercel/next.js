import * as React from 'react'
import Form from 'next/form'

export default function Home() {
  return (
    <Form action="/search" replace id="search-form">
      <input name="query" />
      <button type="submit">Submit</button>
    </Form>
  )
}
