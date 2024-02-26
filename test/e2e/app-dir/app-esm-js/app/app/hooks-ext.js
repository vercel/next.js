import { ClientHooks } from './client-hooks-ext'
import { headers, cookies } from 'next/headers.js'

export function useHooks() {
  headers()
  cookies()
  return <ClientHooks />
}
