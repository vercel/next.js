import React from 'react'

/**
 * Resolves the href of a stylesheet that `experimental.inlineCss` inlines to
 * its CSS text. Provided only while rendering on the server, where the text
 * goes into the document once; on the client the document already holds it.
 */
export type InlinedCssLookup = (href: string) => string | undefined

export const InlinedCssContext: React.Context<InlinedCssLookup | null> =
  React.createContext<InlinedCssLookup | null>(null)

if (process.env.NODE_ENV !== 'production') {
  InlinedCssContext.displayName = 'InlinedCssContext'
}
