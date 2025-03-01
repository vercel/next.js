import React from 'react'
import ClientComponent from './client-component'

export default async ({ searchParams }) => {
  return (
    <div>
      <div id="search-params">{JSON.stringify(await searchParams)}</div>
      <ClientComponent />
    </div>
  )
}
