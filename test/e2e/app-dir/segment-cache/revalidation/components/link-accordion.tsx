'use client'

import Link from 'next/link'
import Form from 'next/form'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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

export function ManualPrefetchLinkAccordion({
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
        data-manual-prefetch-link-accordion={href}
      />
      {isVisible ? (
        <ManualPrefetchLink href={href} prefetch={prefetch}>
          {children}
        </ManualPrefetchLink>
      ) : (
        <>{children} (form is hidden)</>
      )}
    </>
  )
}

function ManualPrefetchLink({
  href,
  children,
  prefetch,
}: {
  href: string
  children: React.ReactNode
  prefetch?: boolean
}) {
  const router = useRouter()
  useEffect(() => {
    if (prefetch !== false) {
      // For as long as the link is mounted, poll the prefetch cache whenever
      // it's invalidated to ensure the data is fresh.
      let didUnmount = false
      const pollPrefetch = () => {
        if (!didUnmount) {
          // @ts-expect-error: onInvalidate is not yet part of public types
          router.prefetch(href, {
            onInvalidate: pollPrefetch,
          })
        }
      }
      pollPrefetch()
      return () => {
        didUnmount = true
      }
    }
  }, [href, prefetch, router])
  return (
    <a
      onClick={(event) => {
        event.preventDefault()
        router.push(href)
      }}
      href={href}
    >
      {children}
    </a>
  )
}
