'use client'

import { useState } from 'react'
import { LinkAccordion } from './link-accordion'

export function DynamicLinkAccordion({
  hrefPattern,
  placeholder,
  initialValue,
}: {
  hrefPattern: string
  placeholder: string
  initialValue: string
}) {
  const [value, setValue] = useState(initialValue)
  const href = hrefPattern.replace(placeholder, value)
  return (
    <div
      data-dynamic-link-accordion={hrefPattern}
      style={{ border: '1px solid lightgrey', padding: '1em' }}
    >
      <div>
        <span>
          Dynamic link generator{' '}
          <label>
            Value
            <input type="text" onChange={(e) => setValue(e.target.value)} />
          </label>
        </span>
        <div>
          <code>{hrefPattern}</code>
        </div>
      </div>
      <div>
        <LinkAccordion key={href} href={href} prefetch="auto">
          {href} (prefetch="auto")
        </LinkAccordion>
      </div>
      <div>
        <LinkAccordion key={href} href={href} prefetch={true}>
          {href} {`(prefetch={true})`}
        </LinkAccordion>
      </div>
    </div>
  )
}
