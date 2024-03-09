import v from 'conditional-exports'
import v1 from 'conditional-exports/subpath'
import { name as serverFieldName } from 'server-module-field'

import Client from './client'

export default function Page() {
  return (
    <div>
      {`Server: ${v}`}
      <br />
      {`Server subpath: ${v1}`}
      <br />
      <Client />
      <br />
      <div id="main-field">{`Server module field: ${serverFieldName}`}</div>
    </div>
  )
}
