'use client'

import { useSelectedLayoutSegments } from 'next/navigation'

export default function Layout({ children, header }) {
  const defaultSegments = useSelectedLayoutSegments()
  const headerSegments = useSelectedLayoutSegments('header')

  return (
    <>
      <p id="default-segments">{JSON.stringify(defaultSegments)}</p>
      <p id="header-segments">{JSON.stringify(headerSegments)}</p>
      <div id="header-slot">{header}</div>
      <div id="children-slot">{children}</div>
    </>
  )
}
