'use client'

import { useInsertionEffect } from 'react'

export default function ClientPage() {
  useInsertionEffect(() => {
    // Logging in client component useInsertionEffect
    // Test complex partial circular object
    const circularObj: any = {
      name: 'test',
      data: {
        nested: {
          value: 42,
          items: [1, 2, 3],
        },
      },
      metadata: {
        name: 'safe stringify',
        version: '1.0.0',
      },
    }
    // Create partial circular reference
    circularObj.data.parent = circularObj
    console.log('Client: Complex circular object:', circularObj)
    console.error('Client: This is an error message from client component')
    console.warn('Client: This is a warning message from client component')
  }, [])

  return <p>client page with logging</p>
}
