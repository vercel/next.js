import Foo from '../components/foo.client'
import Link from 'next/link'

const envVar = process.env.ENV_VAR_TEST
const headerKey = 'x-next-test-client'

export default function Index({ header, router }) {
  return (
    <div>
      <h1>{`component:index.server`}</h1>
      <div>{'path:' + router.pathname}</div>
      <div>{'env:' + envVar}</div>
      <div>{'header:' + header}</div>
      <div>
        <Foo />
      </div>
      <div>
        <Link href={'/next-api/link'}>
          <a id="next-link">next link</a>
        </Link>
      </div>
      <Link href={'/'}>
        <a id="refresh">refresh</a>
      </Link>
    </div>
  )
}

export function getServerSideProps({ req }) {
  const { headers } = req
  const header = headers[headerKey] || ''

  return {
    props: {
      header,
    },
  }
}
