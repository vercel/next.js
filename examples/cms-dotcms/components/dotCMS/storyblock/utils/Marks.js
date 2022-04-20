import DotLink from '../../../link'
import React from 'react'

export const Bold = ({ children }) => <strong>{children}</strong>
export const Italic = ({ children }) => <em>{children}</em>
export const Link = ({ attrs: { href, target }, children }) => (
  <DotLink href={href} target={target}>
    {children}
  </DotLink>
)

export const Strike = ({ children }) => <s>{children}</s>
export const Underline = ({ children }) => <u>{children}</u>
