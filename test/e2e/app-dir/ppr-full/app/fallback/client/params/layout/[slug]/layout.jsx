'use client'

import Dynamic from './dynamic'

export default function Layout({ children, params }) {
  return (
    <div data-file="app/fallback/client/params/[slug]/layout">
      {children}
      <Dynamic params={params} />
    </div>
  )
}
