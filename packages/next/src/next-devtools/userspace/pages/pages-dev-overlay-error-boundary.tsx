import React from 'react'
import { dispatcher } from 'next/dist/compiled/next-devtools'
import isError from '../../../lib/is-error'
import {
  decorateDevError,
  markErrorAsFatal,
} from '../app/errors/stitched-error'

type PagesDevOverlayErrorBoundaryProps = {
  children?: React.ReactNode
}
type PagesDevOverlayErrorBoundaryState = {
  hasError: boolean
}

export class PagesDevOverlayErrorBoundary extends React.PureComponent<
  PagesDevOverlayErrorBoundaryProps,
  PagesDevOverlayErrorBoundaryState
> {
  state = { hasError: false }

  static getDerivedStateFromError(
    error: unknown
  ): Partial<PagesDevOverlayErrorBoundaryState> {
    markErrorAsFatal(error)
    return { hasError: true }
  }

  componentDidCatch(error: unknown): void {
    if (!isError(error)) {
      const normalizedError = decorateDevError(error)
      markErrorAsFatal(normalizedError)
      dispatcher.onUnhandledError(normalizedError)
    }
  }

  // Explicit type is needed to avoid the generated `.d.ts` having a wide return type that could be specific to the `@types/react` version.
  render(): React.ReactNode {
    // The component has to be unmounted or else it would continue to error
    return this.state.hasError ? null : this.props.children
  }
}
