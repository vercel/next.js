'use server'

import * as React from 'react'

export async function action(
  previousState: React.ReactElement,
  formData: FormData
) {
  return <p>{String(formData.get('value'))}</p>
}
