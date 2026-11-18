'use client'

import { useState } from 'react'
import { LinkAccordion } from './link-accordion'

export function DynamicLinkAccordion({
  hrefPattern,
  placeholder,
  initialCount,
}: {
  hrefPattern: string
  placeholder: string
  initialCount: number
}) {
  const [counter, setCounter] = useState(initialCount)
  const href = hrefPattern.replace(placeholder, counter + '')
  return (
    <div style={{ border: '1px solid lightgrey', padding: '1em' }}>
      <div>
        <span>
          Dynamic link generator{' '}
          <button type="button" onClick={() => setCounter((c) => c + 1)}>
            Increment counter
          </button>
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
