'use client'

import Link from 'next/link'
import Form from 'next/form'
import { useState } from 'react'

export function LinkAccordion({
  href,
  children,
  prefetch,
}: {
  href: string
  children: React.ReactNode
  prefetch?: boolean
}) {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={href}
      />
      {isVisible ? (
        <Link href={href} prefetch={prefetch}>
          {children}
        </Link>
      ) : (
        <>{children} (link is hidden)</>
      )}
    </>
  )
}

export function FormAccordion({
  action,
  children,
  prefetch,
}: {
  action: string
  children: React.ReactNode
  prefetch?: null | false
}) {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-form-accordion={action}
      />
      {isVisible ? (
        <Form action={action} prefetch={prefetch}>
          <button>{children}</button>
        </Form>
      ) : (
        <>{children} (form is hidden)</>
      )}
    </>
  )
}
