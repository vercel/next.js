// Dependencies
import * as React from 'react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'

// Internals
import { clsx } from '../utils'



export const Link = ({
  as,
  activeClassName,
  href,
  locale,
  passHref,
  replace,
  scroll,
  shallow,
  title,
  ...rest
}) => {

  const router = useRouter()
  console.log(title)
  if(href === undefined){
    return <></>
  }

  // If the href is external (i.e. not internal), we don't want to
  // pass the href to the next/link component. So we'll just pass
  // the href to a normal anchor tag with a target of _blank and
  // a rel of noopener noreferrer to prevent the page from being
  // supplanted.
  console.log(href)
  if (href.startsWith('http')) {
    return <a {...rest} href={href} rel="noopener noreferrer" target="_blank" />
  }


  const isActive = router.pathname === href

  return (
    <NextLink
      as={as}
      href={href}
      locale={locale}
      passHref={passHref}
      replace={replace}
      scroll={scroll}
      shallow={shallow}
    >
      <a
        {...rest}
        aria-current={isActive ? 'page' : undefined}
        className={clsx(rest.className, isActive && activeClassName)}
      />
    </NextLink>
  )
}

export default Link
