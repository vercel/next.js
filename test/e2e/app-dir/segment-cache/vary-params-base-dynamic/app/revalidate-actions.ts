'use server'

import { revalidateTag } from 'next/cache'

export async function revalidateLayoutByTagExpireNowAction() {
  revalidateTag('_N_T_/layout', 'expireNow')
  return {
    mode: 'server-action-tag-layout-expireNow',
    revalidated: true,
  }
}

export async function revalidateLayoutByTagMaxAction() {
  revalidateTag('_N_T_/layout', 'max')
  return {
    mode: 'server-action-tag-layout-max',
    revalidated: true,
  }
}

export async function revalidateLayoutByTagLegacyAction() {
  // Intentionally test the deprecated call shape without a profile arg.
  // @ts-expect-error
  revalidateTag('_N_T_/layout')
  return {
    mode: 'server-action-tag-layout-legacy',
    revalidated: true,
  }
}
