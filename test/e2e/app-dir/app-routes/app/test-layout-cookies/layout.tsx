import React from 'react'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'

export default async function TestLayout({
  children,
}: {
  children: ReactNode
}) {
  // Test that cookies() works in layout with basePath
  const cookieStore = await cookies()
  const testCookie = cookieStore.get('test-cookie')

  return (
    <div>
      <div data-testid="cookie-value">{testCookie?.value || 'no-cookie'}</div>
      {children}
    </div>
  )
}
