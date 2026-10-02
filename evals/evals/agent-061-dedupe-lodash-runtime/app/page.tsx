'use client'

import { startCase } from 'lodash'
import { legacyLabel } from 'legacy-widget'

export default function Page() {
  return (
    <main>
      <h1>Deployment Status</h1>
      <p>Current status: {startCase('ready for review')}</p>
      <p>Legacy status: {legacyLabel('legacy panel')}</p>
    </main>
  )
}
