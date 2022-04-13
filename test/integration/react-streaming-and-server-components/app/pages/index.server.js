import Nav from '../components/nav'
import Script from 'next/script'

const envVar = process.env.ENV_VAR_TEST
const headerKey = 'x-next-test-client'

export default function Index({ header }) {
  return (
    <div>
      <h1>{`component:index.server`}</h1>
      <div>{'env:' + envVar}</div>
      <div>{'header:' + header}</div>
      <Nav />
      <Script id="client-script">{`;`}</Script>
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
