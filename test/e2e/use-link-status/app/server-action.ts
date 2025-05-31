'use server'

import { redirect } from 'next/navigation'

export async function navigateByServerAction(url: string) {
  redirect(url)
}
