'use server'

import { unstable_expirePath } from 'next/cache'

export async function revalidateSelf() {
  unstable_expirePath('/app/self-revalidate')
}
