'use client'
import React, { useContext, useEffect } from 'react'
import { AppRouterContext } from '../../shared/lib/app-router-context'
import type { AppRouterInstance } from '../../shared/lib/app-router-context'
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
  // FIXME: Reading pathname from PathnameContext directly instead of `useRouter` to
  // prevent the entire `next/navigation` from being introduced to the client bundle due
  // to the inefficient tree-shaking. This is only a temporary workaround and we need to
  // look into the tree-shaking issue in the future.
  const router = useContext(AppRouterContext)

  useEffect(() => {
    // @ts-ignore startTransition exists
    React.startTransition(() => {
      if (redirectType === RedirectType.push) {
        router?.push(redirect, {})
      } else {
        router?.replace(redirect, {})
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
  const router = useContext(AppRouterContext)
  if (!router) {
    throw new Error('invariant expected app router to be mounted')
  }

  return (
    <RedirectErrorBoundary router={router}>{children}</RedirectErrorBoundary>
  )
}
