'use server'

import { redirect } from 'next/navigation'

type State = {
  errors: Record<string, string>
}

export async function action(previousState: State, formData: FormData) {
  const name = formData.get('name')

  if (name !== 'justputit') {
    return { errors: { name: "Only 'justputit' is accepted." } }
  }

  redirect('/self-redirect')
}
