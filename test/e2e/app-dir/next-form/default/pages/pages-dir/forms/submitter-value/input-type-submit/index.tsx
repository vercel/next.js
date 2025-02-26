import * as React from 'react'
import Form from 'next/form'

export default function Page() {
  return (
    <Form action="/pages-dir/search" id="search-form">
      <input id="submit-btn-one" type="submit" name="query" value="one" />
      <input id="submit-btn-two" type="submit" name="query" value="two" />
    </Form>
  )
}
