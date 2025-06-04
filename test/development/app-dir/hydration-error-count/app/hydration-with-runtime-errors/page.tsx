'use client'

import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    throw new Error('runtime error')
  }, [])

  return (
    <p>
      sneaky <p>very sneaky</p>
    </p>
  )
}
