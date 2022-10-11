'use client'

import './client-layout.css'

import Foo from './foo'

export default function ServerLayout({ children }) {
  return (
    <>
      {children}
      <Foo />
    </>
  )
}
