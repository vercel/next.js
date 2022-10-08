import React, { experimental_use as use } from 'react'

export const config = {
  revalidate: 1,
}

async function getData() {
  return {
    world: 'world',
  }
}

export default function Root({ children }) {
  const { world } = use(getData())

  return (
    <html className="this-is-the-document-html">
      <head>
        <title>{`hello ${world}`}</title>
      </head>
      <body className="this-is-the-document-body">{children}</body>
    </html>
  )
}
