'use client'

import React, { useContext } from 'react'
import { InlinedCssContext } from '../../shared/lib/inlined-css-context.shared-runtime'

export interface InlinedStylesheetProps {
  href: string
  precedence: string
  nonce?: string
  crossOrigin?: React.ComponentProps<'link'>['crossOrigin']
}

// The same escaping as React DOM's escapeSelectorAttributeValueInsideDoubleQuotes,
// which it does not export, so the selector below matches the one React uses to
// adopt a hoisted <style> by its data-href.
function escapeSelectorAttributeValue(value: string): string {
  return value.replace(
    /[\n"\\]/g,
    (char) => `\\${char.charCodeAt(0).toString(16)} `
  )
}

/**
 * A stylesheet that `experimental.inlineCss` inlines into the document.
 *
 * The RSC payload carries only this reference, never the CSS text. The server
 * looks the text up from the client reference manifest and renders it as a
 * hoisted <style>, which React emits once per document however many segments
 * reference the stylesheet. The client renders the matching <style> resource
 * when the document already holds the stylesheet, which is the case after
 * hydration, and a <link> to the CSS file otherwise, which is the case on a
 * client navigation into a route whose stylesheet is not in the document yet.
 *
 * The client's <style> is empty on purpose. React treats a <style> with href
 * and precedence as a hoistable resource: on hydration it adopts the existing
 * element found by data-href and never reconciles the resource's children, so
 * the text only has to be in the document, not in the payload. The lookup can
 * only miss if the manifest and the payload disagree about a stylesheet; the
 * <link> then keeps the page styled at the cost of a request.
 */
export function InlinedStylesheet({
  href,
  precedence,
  nonce,
  crossOrigin,
}: InlinedStylesheetProps): React.ReactNode {
  const lookup = useContext(InlinedCssContext)
  if (lookup !== null) {
    const content = lookup(href)
    if (content !== undefined) {
      return (
        <style href={href} precedence={precedence} nonce={nonce}>
          {content}
        </style>
      )
    }
  }

  if (
    typeof document !== 'undefined' &&
    document.querySelector(
      `style[data-href~="${escapeSelectorAttributeValue(href)}"]`
    ) !== null
  ) {
    return <style href={href} precedence={precedence} nonce={nonce} />
  }

  return (
    <link
      rel="stylesheet"
      href={href}
      precedence={precedence}
      crossOrigin={crossOrigin}
      nonce={nonce}
    />
  )
}
