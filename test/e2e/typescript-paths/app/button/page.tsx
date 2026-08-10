import { Hello } from '@mycomponent'
import React from 'react'

export default function page() {
  if ('useState' in React) {
    throw new Error('React is not resolved correctly.')
  }

  return <Hello />
}
