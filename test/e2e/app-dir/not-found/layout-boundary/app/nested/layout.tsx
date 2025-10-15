import React from 'react'
import { notFound } from 'next/navigation'

export default function Layout({ children }: { children: React.ReactNode }) {
  notFound()
  return (
    <div id="layout">
      Layout Wrapper
      {children}
    </div>
  )
}
