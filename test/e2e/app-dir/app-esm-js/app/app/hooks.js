import { use } from 'react'
import { ClientHooks } from './client-hooks'
import { headers, cookies } from 'next/headers'

export function useHooks() {
  use(headers())
  use(cookies())
  return <ClientHooks />
}
