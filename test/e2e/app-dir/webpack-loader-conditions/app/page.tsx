import Client from './client'
import rsc from './file.test-file.js'

export default function Page() {
  return (
    <div>
      <p>server: {JSON.stringify(rsc)}</p>
      <Client />
    </div>
  )
}
