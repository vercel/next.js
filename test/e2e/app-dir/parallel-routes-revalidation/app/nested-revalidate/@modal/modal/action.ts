'use server'

import { unstable_expirePath } from 'next/cache'

export async function revalidateAction() {
  console.log('revalidate action')
  unstable_expirePath('/')
  return {
    success: true,
  }
}
