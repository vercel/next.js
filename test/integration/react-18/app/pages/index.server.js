import Foo, { Foo2 } from '../components/foo.client'
import F from '../components/foo'

import Secret from '../components/secret.server'

console.log('Secret: you should not see this on the client side!')

export default function Index() {
  return (
    <div>
      <h1>only running on the server</h1>
      <p>process.versions: {JSON.stringify(process.versions)}</p>
      <br />
      <F />
      <br />
      <Foo />
      <br />
      <Foo2 />
      <br />
      <Secret />
    </div>
  )
}

export const a = 1
