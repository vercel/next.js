'use client'

import { useEffect, useState } from 'react'

export default function ClientPage() {
  const [bad, setBad] = useState(false)

  useEffect(() => {
    setTimeout(() => {
      setBad(true)
    })
  }, [])

  if (bad) {
    throw Error('nested error')
  }

  return <p>client page</p>
}
