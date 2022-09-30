import Nav from '../components/nav'
import { headers } from 'next/dist/client/components/hooks-server'
// import { name } from 'random-module-instance'

const envVar = process.env.ENV_VAR_TEST
const headerKey = 'x-next-test-client'

export default function Index() {
  const headersList = headers()
  const header = headersList.get(headerKey)

  return (
    <div>
      <style jsx>{`
        .this-wont-be-transformed {
          color: blue;
        }
      `}</style>
      <h1>{`component:index.server`}</h1>
      <div>{'env:' + envVar}</div>
      <div>{'header:' + header}</div>
      {/* <p className='this-wont-be-transformed'>{name}</p> */}
      <Nav />
    </div>
  )
}
