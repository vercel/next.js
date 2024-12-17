'use server'

import { redirect } from 'next/navigation'
import { unstable_expirePath } from 'next/cache'

type State = {
  errors: Record<string, string>
}

export async function action(previousState: State, formData: FormData) {
  const name = formData.get('name')
  const revalidate = formData.get('revalidate')

  if (name !== 'justputit') {
    return { errors: { name: "Only 'justputit' is accepted." } }
  }

  if (revalidate === 'on') {
    unstable_expirePath('/redirect')
  }

  redirect('/redirect/other')
}
