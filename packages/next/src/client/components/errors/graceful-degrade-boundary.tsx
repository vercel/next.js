'use client'

import { Component, createRef, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

function getDomNodeAttributes(node: HTMLElement): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < node.attributes.length; i++) {
    const attr = node.attributes[i]
    result[attr.name] = attr.value
  }
  return result
}

export class GracefulDegradeBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private rootHtml: string
  private htmlAttributes: Record<string, string>
  private htmlRef: React.RefObject<HTMLHtmlElement | null>

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
    this.rootHtml = ''
    this.htmlAttributes = {}
    this.htmlRef = createRef<HTMLHtmlElement>()
  }

  static getDerivedStateFromError(_: unknown): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidMount() {
    const htmlNode = this.htmlRef.current
    if (this.state.hasError && htmlNode) {
      // Reapply the cached HTML attributes to the root element
      Object.entries(this.htmlAttributes).forEach(([key, value]) => {
        htmlNode.setAttribute(key, value)
      })
    }
  }

  render() {
    const { hasError } = this.state
    // Cache the root HTML content on the first render
    if (typeof window !== 'undefined' && !this.rootHtml) {
      this.rootHtml = document.documentElement.innerHTML
      this.htmlAttributes = getDomNodeAttributes(document.documentElement)
    }

    if (hasError) {
      // Render the current HTML content without hydration
      return (
        <html
          ref={this.htmlRef}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: this.rootHtml,
          }}
        />
      )
    }

    return this.props.children
  }
}

export default GracefulDegradeBoundary
