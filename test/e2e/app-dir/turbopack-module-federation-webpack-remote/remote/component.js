import React from 'react'

export default function RemoteComponent() {
  return React.createElement(
    'p',
    { id: 'remote-react-component' },
    'next/dynamic from federated remote'
  )
}
