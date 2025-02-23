'use client'

import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    console.error(new Error('Boom!'))
  })
}
