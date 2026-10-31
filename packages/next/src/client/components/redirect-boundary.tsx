'use client'
import React, { use, useContext } from 'react'
import type { FlightRouterState } from '../../shared/lib/app-router-types'
import { GlobalLayoutRouterContext } from '../../shared/lib/app-router-context.shared-runtime'
import { redirect as redirectNavigation } from './navigator'
import { unresolvedThenable } from './unresolved-thenable'
import { getRedirectTypeFromError, getURLFromRedirectError } from './redirect'
import { type RedirectType, isRedirectError } from './redirect-error'

function SuspendForever(): React.ReactNode {
  use(unresolvedThenable)
  return null
}

interface RedirectBoundaryProps {
  tree: FlightRouterState
  isActive: boolean
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

      return { redirect: url, redirectType }
    }
    // Re-throw if error is not for redirect
    throw error
  }

  // Explicit type is needed to avoid the generated `.d.ts` having a wide return type that could be specific to the `@types/react` version.
  render(): React.ReactNode {
    const { redirect, redirectType } = this.state
    if (redirect !== null && redirectType !== null) {
      // The redirect is the outcome of rendering this tree, so the boundary
      // suspends instead of committing anything, and navigates from a task. A
      // hidden segment never navigates.
      const { tree, isActive } = this.props
      if (isActive) {
        setTimeout(() => redirectNavigation(redirect, redirectType, tree))
      }
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
  const { tree } = useContext(GlobalLayoutRouterContext)
  return (
    <RedirectErrorBoundary tree={tree} isActive={isActive}>
      {children}
    </RedirectErrorBoundary>
  )
}
