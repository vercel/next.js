import React from 'react'
import ShowParams from '../../../show-params'

export default async function Layout(props: {
  children: React.ReactNode
  params: Promise<{}>
}) {
  const params = await props.params

  const { children } = props

  return (
    <div>
      <ShowParams prefix="lvl3" params={await params} />
      {children}
    </div>
  )
}
