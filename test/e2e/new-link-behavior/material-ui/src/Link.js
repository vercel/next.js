import * as React from 'react'
import NextLink from 'next/link'
import MuiLink from '@mui/material/Link'
import { styled } from '@mui/material/styles'

// Add support for the sx prop for consistency with the other branches.
const Anchor = styled(NextLink)({})

export const NextLinkComposed = React.forwardRef(
  function NextLinkComposed(props, ref) {
    const { children, ...rest } = props
    return (
      <Anchor href="/" ref={ref} {...rest}>
        {children}
      </Anchor>
    )
  }
)

// A styled version of the Next.js Link component:
// https://nextjs.org/docs/api-reference/next/link
const Link = React.forwardRef(function Link(props, ref) {
  return <MuiLink component={NextLinkComposed} ref={ref} {...props} />
})

export default Link
