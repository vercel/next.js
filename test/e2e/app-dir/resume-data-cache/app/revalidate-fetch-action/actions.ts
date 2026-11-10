'use server'

import { updateTag } from 'next/cache'
import { getCacheTag } from '../../utils'

export async function revalidateFetchAction() {
  updateTag(getCacheTag('revalidate-fetch-action-test'))
}
