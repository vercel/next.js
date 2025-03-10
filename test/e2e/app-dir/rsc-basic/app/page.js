import Nav from '../components/nav'
import { headers } from 'next/headers'

const envVar = process.env.ENV_VAR_TEST
const headerKey = 'x-next-test-client'

export default async function Index() {
  const headersList = await headers()
  const header = headersList.get(headerKey)

  return (
    <div>
      <h1>{`component:index.server`}</h1>
      <div id="env">{'env:' + envVar}</div>
      <div id="header">{'header:' + header}</div>
      <Nav />
    </div>
  )
}
