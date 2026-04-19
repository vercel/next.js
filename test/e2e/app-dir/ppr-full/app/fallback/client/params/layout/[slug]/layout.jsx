'use client'
import { use } from 'react'

import Dynamic from './dynamic'

export default function Layout(props) {
  const params = use(props.params)

  const { children } = props

  return (
    <div data-file="app/fallback/client/params/[slug]/layout">
      {children}
      <Dynamic params={params} />
    </div>
  )
}
