'use server'

import { unstable_expirePath } from 'next/cache'

export async function action() {
  unstable_expirePath('/', 'layout')
  return true
}
