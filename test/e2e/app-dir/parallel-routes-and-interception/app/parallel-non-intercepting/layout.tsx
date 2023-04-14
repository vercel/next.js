import React from 'react'

export default function Layout({ children, parallel }) {
  return (
    <>
      {children}
      {parallel}
    </>
  )
}
