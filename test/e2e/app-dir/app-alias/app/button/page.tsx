import Button from '@/ui/button'
import React from 'react'

export default function page() {
  if ('useState' in React) {
    throw new Error('React is not resolved correctly.')
  }

  return <Button>click</Button>
}
