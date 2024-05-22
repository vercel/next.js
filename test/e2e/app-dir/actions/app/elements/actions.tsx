'use server'

import * as React from 'react'

export async function action(
  previousState: React.ReactElement,
  formData: FormData
) {
  const value = formData.get('value')
  if (!value) {
    return previousState
  }
  return <p>{String(formData.get('value'))}</p>
}
