import ClientComp from './client-component'
import { headers } from 'next/dist/client/components/hooks-server'

export default function Page() {
  // Opt-in to SSR.
  headers()
  return <ClientComp />
}
