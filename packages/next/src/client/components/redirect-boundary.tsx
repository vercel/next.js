'use client'
import React, { useEffect } from 'react'
import type { AppRouterInstance } from '../../shared/lib/app-router-context.shared-runtime'
import { useRouter } from './navigation'
import { getRedirectTypeFromError, getURLFromRedirectError } from './redirect'
import { RedirectType, isRedirectError } from './redirect-error'

interface RedirectBoundaryProps {
  router: AppRouterInstance
  children: React.ReactNode
}

export class RedirectErrorBoundary extends React.Component<
  RedirectBoundaryProps,
  { redirect: string | null; redirectType: RedirectType | null }
> {
  constructor(props: RedirectBoundaryProps) {
    super(props)
    this.state = { redirect: null, redirectType: null }
  }

  componentDidCatch(error: Error): void {
    if (isRedirectError(error)) {
      const { redirect, redirectType } = this.state
      if (redirect !== null && redirectType !== null) {
        const { router } = this.props
        React.startTransition(() => {
          if (redirectType === RedirectType.push) {
            router.push(redirect, {})
          } else {
            router.replace(redirect, {})
          }
          this.setState({ redirect: null })
        })
      }
    }
  }

  static getDerivedStateFromError(error: any) {
    if (isRedirectError(error)) {
      const url = getURLFromRedirectError(error)
      const redirectType = getRedirectTypeFromError(error)
      if ('handled' in error) {
        // The redirect was already handled. We'll still catch the redirect error
        // so that we can remount the subtree, but we don't actually need to trigger the
        // router.push.
        return { redirect: null, redirectType: null }
      }

      return { redirect: url, redirectType }
    }
    // Re-throw if error is not for redirect
    throw error
  }

  // Explicit type is needed to avoid the generated `.d.ts` having a wide return type that could be specific to the `@types/react` version.
  render(): React.ReactNode {
    const { redirect, redirectType } = this.state
    if (redirect !== null && redirectType !== null) {
      return null
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
