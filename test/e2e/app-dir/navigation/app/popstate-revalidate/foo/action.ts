'use server'

import { expirePath } from 'next/cache'

export async function action() {
  expirePath('/', 'layout')
  return true
}
