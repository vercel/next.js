'use client'

import React, { useActionState } from 'react'
import { action } from './actions'

export default function Page({ children }) {
  const [{ errors }, dispatch] = useActionState(action, {
    errors: { name: '' },
  })

  return (
    <div>
      <form action={dispatch}>
        <input type="text" name="name" />
        <button type="submit">Submit</button>
        {errors.name && <p id="error">{errors.name}</p>}
      </form>
      {children}
    </div>
  )
}
