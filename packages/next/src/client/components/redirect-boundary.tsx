import React, { useEffect } from 'react'
import { useRouter } from './navigation'
import { getURLFromRedirectError, isRedirectError } from './redirect'

import type { AppRouterInstance } from '../../shared/lib/app-router-context'

interface RedirectBoundaryProps {
  router: AppRouterInstance
  children: React.ReactNode
}

function HandleRedirect({ redirect }: { redirect: string }) {
  const router = useRouter()

  useEffect(() => {
    router.replace(redirect, {})
  }, [redirect, router])
  return null
}

class RedirectErrorBoundary extends React.Component<
  RedirectBoundaryProps,
  { redirect: string | null }
> {
  constructor(props: RedirectBoundaryProps) {
    super(props)
    this.state = { redirect: null }
  }

  static getDerivedStateFromError(error: any) {
    console.log({ error })
    if (isRedirectError(error)) {
      const url = getURLFromRedirectError(error)
      return { redirect: url }
    }
    // Re-throw if error is not for redirect
    throw error
  }

  render() {
    console.log({ state: this.state })
    const redirect = this.state.redirect
    if (redirect !== null) {
      return <HandleRedirect redirect={redirect} />
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
