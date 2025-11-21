import { testRequestAPIs } from '../helpers'

export const dynamic = 'error'

export default async function Page() {
  testRequestAPIs('/request-apis/page-dynamic-error')
  return null
}
