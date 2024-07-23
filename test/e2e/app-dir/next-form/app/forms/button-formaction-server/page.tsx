import * as React from 'react'
import Form from 'next/form'
import { redirect } from 'next/navigation'
import { NavigateButton } from './client'

export default function Page() {
  const test = 123
  return (
    <Form action="/" id="search-form">
      <input name="query" />

      <button
        type="submit"
        formAction={async (data) => {
          'use server'
          console.log('hello from server', data)
          redirect('/redirected-from-action')
        }}
      >
        Submit (server action)
      </button>

      <button
        type="submit"
        formAction={async (data) => {
          'use server'
          console.log('hello from server closure', data, { test })
          redirect('/redirected-from-action')
        }}
      >
        Submit (server action, closure)
      </button>

      <NavigateButton to="/redirected-from-action">
        Submit (client action)
      </NavigateButton>
    </Form>
  )
}
