'use client'
import React, { useEffect } from 'react'
import { AppRouterInstance } from '../../shared/lib/app-router-context'
import { useRouter } from './navigation'
import { getURLFromRedirectError, isRedirectError } from './redirect'

interface RedirectBoundaryProps {
  router: AppRouterInstance
  children: React.ReactNode
}

function HandleRedirect({
  redirect,
  reset,
}: {
  redirect: string
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    // @ts-ignore startTransition exists
    React.startTransition(() => {
      router.replace(redirect, {})
      reset()
    })
  }, [redirect, reset, router])

  return null
}

export class RedirectErrorBoundary extends React.Component<
  RedirectBoundaryProps,
  { redirect: string | null }
> {
  constructor(props: RedirectBoundaryProps) {
    super(props)
    this.state = { redirect: null }
  }

  static getDerivedStateFromError(error: any) {
    if (isRedirectError(error)) {
      const url = getURLFromRedirectError(error)
      return { redirect: url }
    }
    // Re-throw if error is not for redirect
    throw error
  }

  render() {
    const redirect = this.state.redirect
    if (redirect !== null) {
      return (
        <HandleRedirect
          redirect={redirect}
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
