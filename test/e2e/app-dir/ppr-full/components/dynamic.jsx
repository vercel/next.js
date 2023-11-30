import React from 'react'
import { headers } from 'next/headers'

export const Dynamic = ({ pathname, fallback }) => {
  if (fallback) {
    return <div>Loading...</div>
  }

  const messages = []
  const names = ['x-test-input', 'user-agent']
  const list = headers()

  for (const name of names) {
    messages.push({ name, value: list.get(name) })
  }

  return (
    <div id="needle">
      <dl>
        {pathname && (
          <>
            <dt>Pathname</dt>
            <dd>{pathname}</dd>
          </>
        )}
        {messages.map(({ name, value }) => (
          <React.Fragment key={name}>
            <dt>
              Header: <code>{name}</code>
            </dt>
            <dd>{value ?? 'null'}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  )
}
