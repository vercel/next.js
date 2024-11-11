'use server'

import { expirePath } from 'next/cache'

export async function revalidateAction() {
  console.log('revalidate action')
  expirePath('/')
  return {
    success: true,
  }
}
