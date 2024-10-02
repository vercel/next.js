'use client'

import { useEffect } from 'react'

export default function PageContent() {
  useEffect(() => {
    console.log('Page 1 Content Mounted')
    return () => {
      console.log('Page 1 Content Unmounted')
    }
  }, [])

  return <h1>Page 2 Content</h1>
}
