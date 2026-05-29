'use client'

import { useActionState } from 'react'
import Form from 'next/form'

import { callNotFoundInAction } from './actions'

export default function Home() {
  const [, submit] = useActionState(callNotFoundInAction, null)
  return (
    <>
      <div>hello</div>
      <div>
        <Form action={submit}>
          <button id="not-found-btn" type="submit">
            Submit
          </button>
        </Form>
      </div>
    </>
  )
}
