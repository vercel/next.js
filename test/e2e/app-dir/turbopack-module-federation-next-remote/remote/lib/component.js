'use client'

import React from 'react'
import { value } from 'shared-value'
import './component.css'

export default function NextRemoteComponent() {
  const [label] = React.useState('React hook from Next.js remote')
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'p',
      { id: 'next-remote-react', className: 'next-remote-component' },
      label
    ),
    React.createElement('p', { id: 'next-remote-shared-value' }, value)
  )
}
