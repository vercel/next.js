import * as React from 'react'
import Form from 'next/form'

export default function Home() {
  return (
    <Form action="/search" id="search-form">
      <button id="submit-btn-one" type="submit" name="query" value="one">
        Search for "one"
      </button>
      <button id="submit-btn-two" type="submit" name="query" value="two">
        Search for "two"
      </button>
    </Form>
  )
}
