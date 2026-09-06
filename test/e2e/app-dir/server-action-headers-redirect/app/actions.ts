'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function action() {
  await headers()
  redirect('/destination')
}
