'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from './navigation'
import {
  getRedirectTypeFromError,
  getURLFromRedirectError,
} from './redirect'
import { RedirectType, isRedirectError } from './redirect-error'

interface RedirectBoundaryProps {
  children: React.ReactNode
}

function HandleRedirect({
  redirect,
  redirectType,
  onReset,
}: {
  redirect: string
  redirectType: RedirectType
  onReset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    React.startTransition(() => {
      if (redirectType === RedirectType.push) {
        router.push(redirect, {})
      } else {
        router.replace(redirect, {})
      }
      onReset()
    })
  }, [redirect, redirectType, onReset, router])

  return null
}

export function RedirectBoundary({ children }: RedirectBoundaryProps) {
  const router = useRouter()
  const [redirect, setRedirect] = useState<string | null>(null)
  const [redirectType, setRedirectType] = useState<RedirectType | null>(null)

  useEffect(() => {
    const handleError = (error: unknown) => {
      if (isRedirectError(error)) {
        const url = getURLFromRedirectError(error)
        const type = getRedirectTypeFromError(error)
        setRedirect(url)
        setRedirectType(type)
      } else {
        // Re-throw if error is not for redirect
        throw error
      }
    }

    // Example: Attach error listener (adjust based on your error handling setup)
    window.addEventListener('error', (event: Event) => {
      handleError((event as CustomEvent).detail)
    })

    return () => {
      // Clean up error listener
      window.removeEventListener('error', (event: Event) => {
        handleError((event as CustomEvent).detail)
      })
    }
  }, [])

  const reset = () => {
    setRedirect(null)
    setRedirectType(null)
  }

  if (redirect !== null && redirectType !== null) {
    return (
      <HandleRedirect
        redirect={redirect}
        redirectType={redirectType}
        onReset={reset}
      />
    )
  }

  return <>{children}</>
}

