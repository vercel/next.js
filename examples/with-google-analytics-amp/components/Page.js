import React from 'react'
import Header from './Header'

export default function Page({ children }) {
  return (
    <div>
      <Header />
      {children}
    </div>
  )
}
