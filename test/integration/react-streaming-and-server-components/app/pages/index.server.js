import Foo from '../components/foo.client'

const envVar = process.env.ENV_VAR_TEST
const headerKey = 'x-next-test-client'

export default function Index({ header }) {
  return (
    <div>
      <h1>{`thisistheindexpage.server`}</h1>
      <div>{envVar}</div>
      <div>{header}</div>
      <div>
        <Foo />
      </div>
    </div>
  )
}

export function getServerSideProps({ req }) {
  const { headers } = req
  const header = headers.get(headerKey)

  return {
    props: {
      header,
    },
  }
}
