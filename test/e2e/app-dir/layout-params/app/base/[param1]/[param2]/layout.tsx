import React from 'react'
import ShowParams from '../../../show-params'

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{}>
}) {
  return (
    <div>
      <ShowParams prefix="lvl3" params={await params} />
      {children}
    </div>
  )
}
