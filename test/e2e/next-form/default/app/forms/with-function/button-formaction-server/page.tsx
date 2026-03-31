import * as React from 'react'
import Form from 'next/form'
import { redirect } from 'next/navigation'

export default function Page() {
  return (
    <Form action="/search" id="search-form">
      <input name="query" />

      <button
        type="submit"
        formAction={async (data) => {
          'use server'
          redirect(
            '/redirected-from-action' +
              '?' +
              new URLSearchParams([...data.entries()] as [string, string][])
          )
        }}
      >
        Submit (server action)
      </button>
    </Form>
  )
}
