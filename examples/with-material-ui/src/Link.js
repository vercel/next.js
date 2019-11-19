/* eslint-disable jsx-a11y/anchor-has-content */
import React from 'react'
import PropTypes from 'prop-types'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import NextLink from 'next/link'
import MuiLink from '@material-ui/core/Link'

const NextComposed = React.forwardRef(function NextComposed (props, ref) {
  const { as, href, prefetch, ...other } = props

  return (
    <NextLink href={href} prefetch={prefetch} as={as}>
      <a ref={ref} {...other} />
    </NextLink>
  )
})

NextComposed.propTypes = {
  as: PropTypes.string,
  href: PropTypes.string,
  prefetch: PropTypes.bool
}

// A styled version of the Next.js Link component:
// https://nextjs.org/docs/#with-link
function Link (props) {
  const {
    activeClassName = 'active',
    className: classNameProps,
    innerRef,
    naked,
    ...other
  } = props
  const router = useRouter()

  const className = clsx(classNameProps, {
    [activeClassName]: router.pathname === props.href && activeClassName
  })

  if (naked) {
    return <NextComposed className={className} ref={innerRef} {...other} />
  }

  return (
    <MuiLink
      component={NextComposed}
      className={className}
      ref={innerRef}
      {...other}
    />
  )
}

Link.propTypes = {
  activeClassName: PropTypes.string,
  as: PropTypes.string,
  className: PropTypes.string,
  href: PropTypes.string,
  innerRef: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
  naked: PropTypes.bool,
  onClick: PropTypes.func,
  prefetch: PropTypes.bool
}

export default React.forwardRef((props, ref) => (
  <Link {...props} innerRef={ref} />
))
