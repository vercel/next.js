'use client'

import React from 'react'

function ClientComponent() {
  const [state] = React.useState('component')
  return <div>{`client-` + state}</div>
}

export const clientRef = <ClientComponent />
