'use client'

import { useActionState } from 'react'
import { invalidate } from './actions'

export function InvalidateForm() {
  const [result, formAction] = useActionState(invalidate, '')
  return (
    <form action={formAction}>
      <input id="tag" name="tag" />
      <button id="update-tag" name="mode" value="update">
        updateTag
      </button>
      <button id="revalidate-tag" name="mode" value="revalidate">
        revalidateTag
      </button>
      <p id="result">{result}</p>
    </form>
  )
}
