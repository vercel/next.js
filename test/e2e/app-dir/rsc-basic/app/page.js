import Nav from '../components/nav'
import { headers } from 'next/headers'

const envVar = process.env.ENV_VAR_TEST
const headerKey = 'x-next-test-client'

export default function Index() {
  const headersList = headers()
  const header = headersList.get(headerKey)

  return (
    <div>
      <h1>{`component:index.server`}</h1>
      <div>{'env:' + envVar}</div>
      <div>{'header:' + header}</div>
      <Nav />
    </div>
  )
}
