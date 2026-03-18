'use client'

export function BuildID() {
  const buildID = require('./lazy-id').buildID
  return (
    <dl>
      <dt>Build ID</dt>
      <dd id="id" suppressHydrationWarning={true}>
        {buildID}
      </dd>
    </dl>
  )
}
