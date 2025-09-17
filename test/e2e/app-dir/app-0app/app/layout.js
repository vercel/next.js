import { use } from 'react'

import '../styles/global.css'
import './style.css'

export const revalidate = 0
export const preferredRegion = 'sfo1'

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
