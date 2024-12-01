import { testRequestAPIs } from '../helpers'

export const dynamic = 'error'

export default async function Page() {
  testRequestAPIs()
  return null
}
