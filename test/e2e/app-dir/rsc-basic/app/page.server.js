import Nav from '../components/nav'
import { useHeaders } from 'next/dist/client/components/hooks-server'

const envVar = process.env.ENV_VAR_TEST
const headerKey = 'x-next-test-client'

export default function Index(props) {
  const header = useHeaders()[headerKey]

  return (
    <div>
      <h1>{`component:index.server`}</h1>
      <div>{'env:' + envVar}</div>
      <div>{'header:' + header}</div>
      <Nav />
    </div>
  )
}
