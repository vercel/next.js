import React from 'react'

export default function WebpackRemoteComponent() {
  const [label] = React.useState('next/dynamic from webpack remote')
  return React.createElement('p', { id: 'remote-react-component' }, label)
}
