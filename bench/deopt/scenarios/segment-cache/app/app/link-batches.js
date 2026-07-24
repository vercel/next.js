'use client'

import Link from 'next/link'
import { useState } from 'react'

/**
 * Renders links in batches that are only mounted after their reveal button is
 * clicked, so the driver controls when each wave of prefetches starts.
 */
export function LinkBatches({ batches }) {
  const [revealed, setRevealed] = useState(0)
  return (
    <div data-batch-count={batches.length} data-revealed={revealed}>
      <button
        id="reveal-next-batch"
        onClick={() => setRevealed((n) => Math.min(n + 1, batches.length))}
      >
        Reveal next batch
      </button>
      {batches.slice(0, revealed).map((links, i) => (
        <ul key={i} data-batch={i}>
          {links.map((link, j) => (
            <li key={j}>
              <Link
                href={link.href}
                prefetch={link.prefetch}
                data-kind={link.kind}
              >
                {link.href}
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}
