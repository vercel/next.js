import React from 'react'
import { Links } from './links'

export const Layout = ({ children }) => {
  return (
    <>
      <h1>Partial Prerendering</h1>
      <p>
        Below are links that are associated with different pages that all will
        partially prerender
      </p>
      <aside>
        <Links />
      </aside>
      <main>{children}</main>
    </>
  )
}
