import { use } from 'react'

async function getData() {
  return {
    world: 'world',
  }
}

export default function Root({ children }) {
  const { world } = use(getData())

  return (
    <html className="this-is-another-document-html">
      <head>
        <title>{`hello ${world}`}</title>
      </head>
      <body className="this-is-another-document-body">{children}</body>
    </html>
  )
}
