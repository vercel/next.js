// TODO-APP: enable when flight error serialization is implemented
import ClientComp from './client-component'
import { headers } from 'next/headers'

export default async function Page() {
  // Opt-in to SSR.
  await headers()
  return <ClientComp />
}
