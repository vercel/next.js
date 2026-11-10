'use client'

import { usePathname } from 'next/navigation'

export function ShouldNotSuspendDuringValidation({ children }) {
  const pathname = usePathname()
  return (
    <>
      <div>Hello, browser! Pathname: "{pathname}"</div>
      <hr />
      {children}
    </>
  )
}
