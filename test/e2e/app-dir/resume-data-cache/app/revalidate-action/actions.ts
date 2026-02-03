'use server'

import { updateTag } from 'next/cache'

export async function revalidateAction() {
  updateTag('revalidate-action-test')
}
