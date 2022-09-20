import ClientComp from './client-component'
import { useHeaders } from 'next/dist/client/components/hooks-client'

export default function Page() {
  // Opt-in to SSR.
  useHeaders()
  return <ClientComp />
}
