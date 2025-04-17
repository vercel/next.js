'use client'

import { Component, useEffect, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

function getDomNodeAttributes(
  node: HTMLElement
): Record<string, string> {
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

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
    this.rootHtml = ''
    this.htmlAttributes = {}
  }

  static getDerivedStateFromError(_: unknown): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch() {
    // define to catch the error
  }

  render() {
    const { hasError } = this.state
    // Cache the root HTML content on the first render
    if (typeof window !== 'undefined' && !this.rootHtml) {
      this.rootHtml = document.documentElement.innerHTML
      this.htmlAttributes = getDomNodeAttributes(document.documentElement)
    }

    useEffect(() => {
      if (hasError) {
        // set html attributes to new html element, only once
        const htmlNode = document.documentElement
        for (const key in this.htmlAttributes) {
          (htmlNode as any)[key] = this.htmlAttributes[key]
        }
      }
    }, [hasError])

    if (hasError) {
      // Render the current HTML content without hydration
      return (
        <html
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
