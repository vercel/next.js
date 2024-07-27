'use client'

import React, { useContext } from 'react'
import { warnOnce } from '../../shared/lib/utils/warn-once'
import { usePathname } from './navigation'
import { MissingSlotContext } from '../../shared/lib/app-router-context.shared-runtime'
import {
  uiErrorFileTypes,
  type UIErrorFileType,
} from '../../shared/lib/ui-error-types'

interface UIErrorBoundaryProps
  extends Record<
    UIErrorFileType,
    React.ReactNode | { component: React.ReactNode; styles: React.ReactNode }
  > {
  forceTrigger?: boolean
  children: React.ReactNode
  pathname: string
  matcher: (error: unknown) => UIErrorFileType | undefined
  missingSlots?: Set<string>
}

interface UIErrorBoundaryState {
  error?: Error
  didCatch: boolean
  previousPathname: string
}

class UIErrorBoundary extends React.Component<
  UIErrorBoundaryProps,
  UIErrorBoundaryState
> {
  constructor(props: UIErrorBoundaryProps) {
    super(props)
    this.state = {
      didCatch: !!props.forceTrigger,
      previousPathname: props.pathname,
    }
  }

  componentDidCatch(): void {
    if (
      process.env.NODE_ENV === 'development' &&
      this.props.missingSlots &&
      // A missing children slot is the typical ui-error case, so no need to warn
      !this.props.missingSlots.has('children')
    ) {
      let warningMessage =
        `No default component was found for a parallel route rendered on this page. Falling back to nearest ${this.props.matcher(this.state.error)} boundary.
` +
        'Learn more: https://nextjs.org/docs/app/building-your-application/routing/parallel-routes#defaultjs\n\n'

      if (this.props.missingSlots.size > 0) {
        const formattedSlots = Array.from(this.props.missingSlots)
          .sort((a, b) => a.localeCompare(b))
          .map((slot) => `@${slot}`)
          .join(', ')

        warningMessage += 'Missing slots: ' + formattedSlots
      }

      warnOnce(warningMessage)
    }
  }

  static getDerivedStateFromError(error: any): Partial<UIErrorBoundaryState> {
    return { didCatch: true, error }
  }

  static getDerivedStateFromProps(
    props: UIErrorBoundaryProps,
    state: UIErrorBoundaryState
  ): UIErrorBoundaryState | null {
    /**
     * Handles reset of the error boundary when a navigation happens.
     * Ensures the error boundary does not stay enabled when navigating to a new page.
     * Approach of setState in render is safe as it checks the previous pathname and then overrides
     * it as outlined in https://react.dev/reference/react/useState#storing-information-from-previous-renders
     */

    if (props.pathname !== state.previousPathname && state.didCatch) {
      return {
        didCatch: false,
        previousPathname: props.pathname,
      }
    }
    return {
      didCatch: state.didCatch,
      previousPathname: props.pathname,
    }
  }

  objectToComponent(componentName: UIErrorFileType): React.ReactNode {
    if (
      this.props[componentName] !== null &&
      typeof this.props[componentName] === 'object' &&
      'component' in this.props[componentName]
    ) {
      return this.props[componentName].component
    }
    return this.props[componentName]
  }

  assertUIComponents() {
    uiErrorFileTypes.forEach((type) => {
      if (
        this.props.matcher(this.state.error) === type &&
        !this.objectToComponent(type)
      ) {
        throw this.state.error
      }
    })
  }

  renderUIComponent(componentName: UIErrorFileType | undefined) {
    if (
      !componentName ||
      this.props.matcher(this.state.error) !== componentName
    ) {
      return
    }

    if (
      this.props[componentName] !== null &&
      typeof this.props[componentName] === 'object' &&
      'component' in this.props[componentName]
    ) {
      return (
        <>
          {this.props[componentName].component}
          {this.props[componentName].styles}
        </>
      )
    }

    return this.props[componentName]
  }

  render() {
    if (this.state.didCatch) {
      if (!this.props.forceTrigger && !this.props.matcher(this.state.error)) {
        throw this.state.error
      }

      this.assertUIComponents()

      return (
        <>
          <meta name="robots" content="noindex" />
          {process.env.NODE_ENV === 'development' && (
            <meta
              name="next-error"
              content={this.props.matcher(this.state.error)}
            />
          )}

          {this.renderUIComponent(this.props.matcher(this.state.error))}
        </>
      )
    }

    return this.props.children
  }
}

export type UIErrorBoundaryWrapperProps = Omit<
  UIErrorBoundaryProps,
  'pathname' | 'missingSlots'
>

export function UIErrorBoundaryWrapper({
  children,
  ...rest
}: UIErrorBoundaryWrapperProps) {
  const pathname = usePathname()
  const missingSlots = useContext(MissingSlotContext)
  return (
    <UIErrorBoundary pathname={pathname} missingSlots={missingSlots} {...rest}>
      {children}
    </UIErrorBoundary>
  )
}
