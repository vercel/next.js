'use server'

import { redirect } from 'next/navigation'

export async function redirectToTarget() {
  redirect('/redirect-target')
}
