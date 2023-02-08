import Counter from './counter'

import { createHash } from 'crypto'

function generateActionId(filePath, exportName) {
  return createHash('sha1')
    .update(filePath + ':' + exportName)
    .digest('hex')
}

import { inc, dec } from './actions'

export default function Page() {
  return (
    <>
      <h1>Page</h1>
      <Counter
        inc={generateActionId(inc.$$filepath, inc.$$name)}
        dec={generateActionId(dec.$$filepath, dec.$$name)}
      />
    </>
  )
}
