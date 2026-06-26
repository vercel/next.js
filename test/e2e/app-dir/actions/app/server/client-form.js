'use client'

import { redirectAction } from './actions'

export default function Form() {
  return (
    <form>
      <input type="text" name="hidden-info" defaultValue="hi" hidden />
      <input type="text" name="name" id="client-name" required />
      <button formAction={redirectAction} type="submit" id="there">
        Go there
      </button>
    </form>
  )
}
