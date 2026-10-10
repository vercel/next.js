'use client'
import { describeDocsVendor } from './vendor-docs'
import { useState } from 'react'
export default function TocScrollspy({ items }) {
  const [active, setActive] = useState(items[0]?.id)
  return (
    <>
      {items.map((item) => (
        <a
          key={item.id}
          href={'#' + item.id}
          className={
            (item.level > 2 ? 'toc-h3' : '') +
            (active === item.id ? ' active' : '')
          }
          aria-current={active === item.id ? 'location' : undefined}
          onClick={() => setActive(item.id)}
        >
          {item.label}
        </a>
      ))}
    </>
  )
}
export const __vendor = typeof describeDocsVendor
