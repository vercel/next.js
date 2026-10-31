'use client'
import React, { use, useEffect } from 'react'
import type { AppRouterInstance } from '../../shared/lib/app-router-context.shared-runtime'
import { useRouter } from './navigation'
import { getRedirectTypeFromError, getURLFromRedirectError } from './redirect'
import { type RedirectType, isRedirectError } from './redirect-error'
import { unresolvedThenable } from './unresolved-thenable'

interface RedirectBoundaryProps {
  router: AppRouterInstance
  isActive: boolean
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

function SuspendForever(): React.ReactNode {
  use(unresolvedThenable)
  return null
}

interface RedirectBoundaryState {
  redirect: string | null
  redirectType: RedirectType | null
  handledRedirect: boolean
}

export class RedirectErrorBoundary extends React.Component<
  RedirectBoundaryProps,
  RedirectBoundaryState
> {
  constructor(props: RedirectBoundaryProps) {
    super(props)
    this.state = { redirect: null, redirectType: null, handledRedirect: false }
  }

  static getDerivedStateFromError(error: unknown) {
    if (isRedirectError(error)) {
      const url = getURLFromRedirectError(error)
      const redirectType = getRedirectTypeFromError(error)
      if ('handled' in error) {
        // A Server Action's redirect, which the reducer has already navigated
        // to. It only reaches a boundary because the action's rejection is
        // stored in the caller's state and thrown again on every render.
        // Remounting the subtree is the only way to clear it.
        return { redirect: null, redirectType: null, handledRedirect: true }
      }

      return { redirect: url, redirectType }
    }
    // Re-throw if error is not for redirect
    throw error
  }

  static getDerivedStateFromProps(
    props: RedirectBoundaryProps,
    state: RedirectBoundaryState
  ): Partial<RedirectBoundaryState> | null {
    if (state.handledRedirect && props.isActive) {
      // Render the children again, which remounts them.
      return { handledRedirect: false }
    }
    return null
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

    if (this.state.handledRedirect) {
      // The segment is hidden, so it doesn't remount yet. Remounting now would
      // rebuild it from the data it had before the action. Nothing from this
      // render commits, so the rejection is thrown again when the segment is
      // shown, and the remount happens then, with current data.
      return <SuspendForever />
    }

    return this.props.children
  }
}

export function RedirectBoundary({
  isActive,
  children,
}: {
  isActive: boolean
  children: React.ReactNode
}) {
  const router = useRouter()
  return (
    <RedirectErrorBoundary router={router} isActive={isActive}>
      {children}
    </RedirectErrorBoundary>
  )
}
