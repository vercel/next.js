import * as React from 'react'
import Form from 'next/form'
import { redirect } from 'next/navigation'

export default function Page() {
  return (
    <Form
      id="search-form"
      action={async (data) => {
        'use server'
        redirect(
          '/redirected-from-action' +
            '?' +
            new URLSearchParams([...data.entries()] as [string, string][])
        )
      }}
    >
      <input name="query" />

      <button type="submit">Submit (server action)</button>
    </Form>
  )
}
