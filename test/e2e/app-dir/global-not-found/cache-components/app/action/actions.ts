'use server'

import { redirect } from 'next/navigation'

export async function callNotFoundInAction() {
  redirect('/not-found')
}
