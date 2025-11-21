import { testRequestAPIs } from '../helpers'

export const dynamic = 'force-static'

export default async function Page() {
  testRequestAPIs('/request-apis/page-force-static')
  return null
}
