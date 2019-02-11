import React from 'react'

export default ({ placeholder }) => (
  <React.Fragment>
    <h2>JSON:</h2>
    {placeholder.data && (
      <pre>
        <code>{JSON.stringify(placeholder.data, null, 2)}</code>
      </pre>
    )}
    {placeholder.error && (
      <p style={{ color: 'red' }}>Error: {placeholder.error.message}</p>
    )}
    <style jsx>{`
      aside {
        font-size: 14px;
      }
    `}</style>
  </React.Fragment>
)
