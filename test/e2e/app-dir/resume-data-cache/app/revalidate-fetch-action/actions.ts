'use server'

import { updateTag } from 'next/cache'

export async function revalidateFetchAction() {
  updateTag('revalidate-fetch-action-test')
}
