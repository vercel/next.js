'use client'

import { Component, createRef } from 'react'
import type { ErrorInfo, ReactNode, RefObject } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

const errorBannerHtml = `\
<div id="next-graceful-error" style="position: fixed; bottom: 16px; right: 16px; background: #fff; color: #000; padding: 12px 20px; z-index: 999;">
  An error occurred during page rendering
</div>`

export class GracefullyDegradingErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private ssrBodyHtml: RefObject<string | null>
  private bodyAttributes: Record<string, string>

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
    this.ssrBodyHtml = createRef()
    this.bodyAttributes = {}
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
      console.error(error, errorInfo)
    }
  }

  componentDidMount() {
    // apply this.bodyAttributes to the body element
    const body = document.body
    if (!body) return
    // set all attributes of the body element
    for (const [key, value] of Object.entries(this.bodyAttributes)) {
      // @ts-ignore skip ban-element-setattribute warning
      ;(body as any).setAttribute(key, value)
    }
  }

  render() {
    if (typeof window !== 'undefined' && !this.ssrBodyHtml.current) {
      this.ssrBodyHtml.current = window.document.body.innerHTML
      // clone body attributes which still need to be displayed
      // in the new container body element of the graceful error
      const body = document.body
      // get all attributes of the body element
      const attributes = body.attributes
      for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i]
        this.bodyAttributes[attr.name] = attr.value
      }
    }
    if (this.state.hasError) {
      // Render the current HTML content without hydration
      return (
        <>
          {/* Use body as the root container, render the ssr'd body html under it */}
          <body
            suppressHydrationWarning
            dangerouslySetInnerHTML={{
              // Concatenate the existing HTML with the error banner HTML
              __html: (this.ssrBodyHtml.current || '') + errorBannerHtml,
            }}
          ></body>
        </>
      )
    }

    return this.props.children
  }
}
