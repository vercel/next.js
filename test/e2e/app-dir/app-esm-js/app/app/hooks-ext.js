import { use } from 'react'
import { ClientHooks } from './client-hooks-ext'
import { headers, cookies } from 'next/headers.js'

export function useHooks() {
  headers()
  use(cookies())
  return <ClientHooks />
}
