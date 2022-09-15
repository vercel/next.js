import Nav from '../components/nav'

const envVar = process.env.ENV_VAR_TEST
const headerKey = 'x-next-test-client'

export default function Index({ header }) {
  return (
    <div>
      <h1>{`component:index.server`}</h1>
      <div>{'env:' + envVar}</div>
      <div>{'header:' + header}</div>
      <Nav />
    </div>
  )
}

export function getServerSideProps(ctx) {
  const { headers } = ctx
  const header = headers[headerKey] || ''

  return {
    props: {
      header,
    },
  }
}
