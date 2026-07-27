import React from 'react'
import Link from 'next/link'

export const links = [
  { href: '/', tag: 'pre-generated' },
  { href: '/metadata', tag: 'pre-generated' },
  { href: '/nested/a', tag: 'pre-generated' },
  { href: '/nested/b', tag: 'on-demand' },
  { href: '/nested/c', tag: 'on-demand' },
  { href: '/on-demand/a', tag: 'on-demand, no-gsp' },
  { href: '/on-demand/b', tag: 'on-demand, no-gsp' },
  { href: '/on-demand/c', tag: 'on-demand, no-gsp' },
  { href: '/loading/a', tag: 'loading.jsx, pre-generated' },
  { href: '/loading/b', tag: 'loading.jsx, on-demand' },
  { href: '/loading/c', tag: 'loading.jsx, on-demand' },
  { href: '/static', tag: 'static' },
  { href: '/no-suspense', tag: 'no suspense' },
  { href: '/no-suspense/nested/a', tag: 'no suspense, pre-generated' },
  { href: '/no-suspense/nested/b', tag: 'no suspense, on-demand' },
  { href: '/no-suspense/nested/c', tag: 'no suspense, on-demand' },
  { href: '/dynamic/force-dynamic', tag: "dynamic = 'force-dynamic'" },
  {
    href: '/dynamic/force-dynamic/nested/a',
    tag: "dynamic = 'force-dynamic', on-demand, no-gsp",
  },
  {
    href: '/dynamic/force-dynamic/nested/b',
    tag: "dynamic = 'force-dynamic', on-demand, no-gsp",
  },
  {
    href: '/dynamic/force-dynamic/nested/c',
    tag: "dynamic = 'force-dynamic', on-demand, no-gsp",
  },
  { href: '/dynamic/force-static', tag: "dynamic = 'force-static'" },
  { href: '/navigation/not-found', tag: 'not-found' },
  { href: '/navigation/not-found/dynamic', tag: 'not-found' },
  { href: '/navigation/redirect', tag: 'redirect' },
  { href: '/pages', tag: 'pages' },
  { href: '/fallback/params/browser-01', tag: 'fallback, params' },
  { href: '/fallback/use-params/browser-01', tag: 'fallback, use-params' },
  { href: '/fallback/use-pathname/browser-01', tag: 'fallback, use-pathname' },
  {
    href: '/fallback/use-selected-layout-segment/browser-01',
    tag: 'fallback, use-selected-layout-segment',
  },
  {
    href: '/fallback/use-selected-layout-segments/browser-01',
    tag: 'fallback, use-selected-layout-segments',
  },
]

export const Links = () => {
  return (
    <ul>
      {links.map(({ href, tag }) => (
        <li key={href}>
          <Link href={href}>{href}</Link> <span>{tag}</span>
        </li>
      ))}
    </ul>
  )
}
