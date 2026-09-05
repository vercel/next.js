'use server'

import { revalidatePath } from 'next/cache'

export async function action() {
  return 'result'
}

export async function revalidatingAction() {
  revalidatePath('/server-action-mpa-partial')
  return 'revalidated'
}
