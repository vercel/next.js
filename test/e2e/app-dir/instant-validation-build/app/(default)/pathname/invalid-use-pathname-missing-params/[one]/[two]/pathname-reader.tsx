'use client'

import { usePathname } from 'next/navigation'
import { ensureThrows } from '../../../../../../ensure-error'

export function PathnameReader() {
  ensureThrows(
    // eslint-disable-next-line react-hooks/rules-of-hooks
    () => usePathname(),
    `Expected usePathname() to throw when not all params are provided in samples`
  )
  return null
}
