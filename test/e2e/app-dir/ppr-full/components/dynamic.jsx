import React, { use } from 'react'
import * as next from 'next/headers'

export const Dynamic = ({ pathname, fallback }) => {
  if (fallback) {
    return <div>Dynamic Loading...</div>
  }

  const headers = next.headers()
  const messages = []
  for (const name of ['x-test-input', 'user-agent']) {
    messages.push({ name, value: headers.get(name) })
  }

  const delay = headers.get('x-delay')
  if (delay) {
    use(new Promise((resolve) => setTimeout(resolve, parseInt(delay, 10))))
  }

  return (
    <dl>
      {pathname && (
        <>
          <dt>Pathname</dt>
          <dd data-pathname={pathname}>{pathname}</dd>
        </>
      )}
      {messages.map(({ name, value }) => (
        <React.Fragment key={name}>
          <dt>
            Header: <code>{name}</code>
          </dt>
          <dd>{value ?? `MISSING:${name.toUpperCase()}`}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}
