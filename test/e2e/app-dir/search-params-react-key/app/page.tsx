import React from 'react'
import ClientComponent from './client-component'

export default ({ searchParams }) => {
  return (
    <div>
      <div id="search-params">{JSON.stringify(searchParams)}</div>
      <ClientComponent />
    </div>
  )
}
