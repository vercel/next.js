'use server'

import { expirePath } from 'next/cache'

export async function revalidateSelf() {
  expirePath('/app/self-revalidate')
}
