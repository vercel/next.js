import React, { ReactNode } from 'react'
import './global.css'
import server from './server.module.css'

import Inner from './inner'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <p id="server" className={`global-class ${server.class}`}>
        Hello Server
      </p>
      <Inner />
      {children}
    </>
  )
}
