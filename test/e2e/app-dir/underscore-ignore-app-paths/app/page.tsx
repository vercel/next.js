'use client'
import { redirect } from 'next/navigation'
import { useState } from 'react'
export default function Page() {
  console.log('TEST')
  const [shouldRedirect, setRedirect] = useState(false)
  if (shouldRedirect) {
    redirect('/dashboard')
  }

  return <p onClick={() => setRedirect(true)}>hello world</p>
}
