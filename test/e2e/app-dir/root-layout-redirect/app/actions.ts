'use server'

import { redirect } from 'next/navigation'

export async function redirectAction() {
  redirect('/result')
}
