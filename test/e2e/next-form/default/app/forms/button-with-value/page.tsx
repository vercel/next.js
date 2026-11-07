import * as React from 'react'
import Form from 'next/form'

export default function Home() {
  return (
    <Form action="/search" id="search-form">
      <input name="query" />
      <button type="submit" name="sort" value="relevance">
        Submit
      </button>
      {/* comes after the submitter, to verify that the entries stay in tree order */}
      <input name="page" defaultValue="1" />
    </Form>
  )
}
