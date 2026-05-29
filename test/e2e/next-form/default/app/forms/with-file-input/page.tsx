import * as React from 'react'
import Form from 'next/form'

export default function Home() {
  return (
    <Form action="/search" id="search-form">
      <input name="query" type="text" />
      <input name="file" type="file" />
      <button type="submit">Submit</button>
    </Form>
  )
}
