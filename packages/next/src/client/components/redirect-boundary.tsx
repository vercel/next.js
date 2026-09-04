'use client'
import React, { useEffect } from 'react'
import type { AppRouterInstance } from '../../shared/lib/app-router-context.shared-runtime'
import { publicAppRouterInstance } from './app-router-instance'
import { useRouter } from './navigation'
import { getRedirectTypeFromError, getURLFromRedirectError } from './redirect'
import { type RedirectType, isRedirectError } from './redirect-error'

// Dedupes redirect() delivery when RedirectErrorBoundary remounts in a
// discarded render (fully-dynamic cacheComponents navigations). See #97898.
let lastScheduledRedirect: { url: string; at: number } | null = null

function scheduleRedirect(url: string, redirectType: RedirectType) {
  const now = Date.now()
  if (
    lastScheduledRedirect !== null &&
    lastScheduledRedirect.url === url &&
    now - lastScheduledRedirect.at < 1000
  ) {
    return
  }
  lastScheduledRedirect = { url, at: now }
  // Do not wait for a commit — on ƒ routes the errored render never commits,
  // so HandleRedirect's useEffect never runs. queueMicrotask is enough
  // because getDerivedStateFromError already ran.
  queueMicrotask(() => {
    if (redirectType === 'push') {
      publicAppRouterInstance.push(url, {})
    } else {
      publicAppRouterInstance.replace(url, {})
    }
  })
}

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
      if (redirectType === 'push') {
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

  static getDerivedStateFromError(error: unknown) {
    if (isRedirectError(error)) {
      const url = getURLFromRedirectError(error)
      const redirectType = getRedirectTypeFromError(error)
      if ('handled' in error) {
        // The redirect was already handled. We'll still catch the redirect error
        // so that we can remount the subtree, but we don't actually need to trigger the
        // router.push.
        return { redirect: null, redirectType: null }
      }

      // Schedule the navigation during the render phase. On fully-dynamic
      // cacheComponents routes the boundary remounts and the render never
      // commits, so HandleRedirect's effect would never fire. See #97898.
      scheduleRedirect(url, redirectType)

      return { redirect: url, redirectType }
    }
    // Re-throw if error is not for redirect
    throw error
  }

  // Explicit type is needed to avoid the generated `.d.ts` having a wide return type that could be specific to the `@types/react` version.
  render(): React.ReactNode {
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
