import Client from './client.js'
import rsc from './file.test-file.js'

export default function Page() {
  return (
    <>
      <p>server: {JSON.stringify(rsc)}</p>
      <Client />
    </>
  )
}
