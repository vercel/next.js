'use client'
import React, { useEffect } from 'react'
import type { AppRouterInstance } from '../../shared/lib/app-router-context.shared-runtime'
import { useRouter } from './navigation'
import {
  RedirectType,
  getRedirectTypeFromError,
  getURLFromRedirectError,
  isRedirectError,
} from './redirect'

interface RedirectBoundaryProps {
  router: AppRouterInstance
  children: React.ReactNode
}

function HandleRedirect({
  redirect,
  reset,
  redirectType,
}: {
  redirect: string
  redirectType: RedirectType
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    React.startTransition(() => {
      if (redirectType === RedirectType.push) {
        router.push(redirect, {})
      } else {
        router.replace(redirect, {})
      }
      reset()
    })
  }, [redirect, redirectType, reset, router])

  return null
}

export class RedirectErrorBoundary extends React.Component<
  RedirectBoundaryProps,
  { redirect: string | null; redirectType: RedirectType | null }
> {
  constructor(props: RedirectBoundaryProps) {
    super(props)
    this.state = { redirect: null, redirectType: null }
  }

  static getDerivedStateFromError(error: any) {
    if (isRedirectError(error)) {
      const url = getURLFromRedirectError(error)
      const redirectType = getRedirectTypeFromError(error)
      return { redirect: url, redirectType }
    }
    // Re-throw if error is not for redirect
    throw error
  }

  render() {
    const { redirect, redirectType } = this.state
    if (redirect !== null && redirectType !== null) {
      return (
        <HandleRedirect
          redirect={redirect}
          redirectType={redirectType}
          reset={() => this.setState({ redirect: null })}
        />
      )
    }

    return this.props.children
  }
}

export function RedirectBoundary({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  return (
    <RedirectErrorBoundary router={router}>{children}</RedirectErrorBoundary>
  )
}
