'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { unstable_useRelativeHref } from 'next/navigation'

function RelativeHrefLink({ target }: { target: string }) {
  const href = unstable_useRelativeHref(target)
  return (
    <Link
      className="relative-href"
      data-target={target}
      href={href}
      prefetch={false}
    >
      {href}
    </Link>
  )
}

/**
 * Each link gets its own Suspense boundary: when the href depends on a
 * fallback param's value, prerendering the fallback shell deopts just that
 * link into a dynamic hole (the fallback below is what lands in the shell),
 * while value-invariant links stay fully static.
 */
export function RelativeHrefs({
  id,
  targets,
}: {
  id: string
  targets: string[]
}) {
  return (
    <div id={id}>
      {targets.map((target) => (
        <div key={target}>
          <Suspense
            fallback={
              <div className="relative-href-fallback" data-target={target}>
                loading-relative-href
              </div>
            }
          >
            <RelativeHrefLink target={target} />
          </Suspense>
        </div>
      ))}
    </div>
  )
}
