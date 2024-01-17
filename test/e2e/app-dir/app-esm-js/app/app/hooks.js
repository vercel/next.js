import { ClientHooks } from './client-hooks'
import { headers, cookies } from 'next/headers'

export function useHooks() {
  headers()
  cookies()
  return <ClientHooks />
}
