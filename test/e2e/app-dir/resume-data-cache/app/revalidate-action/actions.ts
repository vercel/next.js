'use server'

import { updateTag } from 'next/cache'
import { getCacheTag } from '../../utils'

export async function revalidateAction() {
  updateTag(getCacheTag('revalidate-action-test'))
}
