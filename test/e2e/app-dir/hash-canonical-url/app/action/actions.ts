'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function revalidate(pathname: string) {
  revalidatePath(pathname)
}

export async function redirectWithHash() {
  redirect('/redirect-target#section')
}
