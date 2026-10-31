import React from 'react'

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
    _: unknown
  ): Partial<PagesDevOverlayErrorBoundaryState> {
    return { hasError: true }
  }

  // Explicit type is needed to avoid the generated `.d.ts` having a wide return type that could be specific to the `@types/react` version.
  render(): React.ReactNode {
    // The component has to be unmounted or else it would continue to error
    return this.state.hasError ? null : this.props.children
  }
}
