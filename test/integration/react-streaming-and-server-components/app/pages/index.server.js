import Nav from '../components/nav'
import Script from 'next/script'
import Head from 'next/head'

const envVar = process.env.ENV_VAR_TEST
const headerKey = 'x-next-test-client'

export default function Index({ header }) {
  return (
    <div>
      <Head>
        <meta name="rsc-title" content="index" />
      </Head>
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
