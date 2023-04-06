'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

const ButtonLink = ({
  addBefore = true,
  pathname,
  from,
  to,
}: {
  addBefore?: boolean
  pathname: string
  from: string
  to: string
}) => {
  const router = useRouter()
  let href = [from, to, pathname].join('/')
  if (addBefore) href += '-before'
  const name = [from, to, pathname].join('-').replace('/', '-')

  return (
    <>
      <Link id={`link-${name}`} href={href}>
        Link to {href}
      </Link>
      <button id={`button-${name}`} onClick={() => router.push(href)}>
        Button to {href}
      </button>
    </>
  )
}

const Test = ({
  pathname,
  addBefore,
}: {
  pathname: string
  addBefore?: boolean
}) => {
  return (
    <>
      <ButtonLink
        addBefore={addBefore}
        pathname={pathname}
        from="app"
        to="app"
      />
      <ButtonLink
        addBefore={addBefore}
        pathname={pathname}
        from="app"
        to="pages"
      />
      <ButtonLink
        addBefore={addBefore}
        pathname={pathname}
        from="pages"
        to="app"
      />
    </>
  )
}

export default function Page() {
  return (
    <>
      <Test pathname="middleware-rewrite" />
      <Test pathname="middleware-redirect" />
      <Test pathname="config-rewrite" />
      <Test pathname="config-redirect" />
      <Test
        pathname="config-redirect-catchall-before/thing"
        addBefore={false}
      />
    </>
  )
}
