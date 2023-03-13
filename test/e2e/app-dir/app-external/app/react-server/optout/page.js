import v from 'conditional-exports-optout'
import v1 from 'conditional-exports-optout/subpath'

import Client from './client'

export default function Page() {
  return (
    <div>
      {`Server: ${v}`}
      <br />
      {`Server subpath: ${v1}`}
      <br />
      <Client />
    </div>
  )
}
