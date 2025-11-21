import React from 'react'
import { RouteRefresher } from '../../../components/RouterRefresh'

export default async function Page() {
  return (
    <main>
      <h1>With generateStaticParams</h1>
      <RouteRefresher />
    </main>
  )
}

export function generateStaticParams() {
  return [{ id: 'foo' }]
}
