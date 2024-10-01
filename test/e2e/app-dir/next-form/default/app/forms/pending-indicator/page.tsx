import * as React from 'react'
import Form from 'next/form'
import { SubmitButton } from './submit-button'

export default function Home() {
  return (
    <Form action="/search-without-loading" id="search-form">
      <input name="query" />
      <SubmitButton />
    </Form>
  )
}
