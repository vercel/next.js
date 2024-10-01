import * as React from 'react'
import Form from 'next/form'
import { SubmitButton } from '../../../../app/forms/pending-indicator/submit-button'

export default function Home() {
  return (
    <Form action="/pages-dir/search" id="search-form">
      <input name="query" />
      <SubmitButton />
    </Form>
  )
}
