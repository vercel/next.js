// TODO-APP: enable when flight error serialization is implemented
import ClientComp from './client-component'
import { useHeaders } from 'next/dist/client/components/hooks-server'

export default function Page() {
  // Opt-in to SSR.
  useHeaders()
  return <ClientComp />
}
