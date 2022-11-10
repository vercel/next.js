import { version } from 'esm-with-react'

import React from 'react'

export default function Index() {
  return (
    <div>
      <h2>{'App React Version: ' + React.version}</h2>
      <h2>{'External React Version: ' + version}</h2>
    </div>
  )
}
