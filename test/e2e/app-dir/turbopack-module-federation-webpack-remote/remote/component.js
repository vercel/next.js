import React from 'react'

export default function WebpackRemoteComponent() {
  return React.createElement(
    'p',
    { id: 'remote-react-component' },
    'next/dynamic from webpack remote'
  )
}
