'use client'

import Link from 'next/link'
import { unstable_useRelativeHref } from 'next/navigation'

function RelativeHrefLink({ target }: { target: string }) {
  const href = unstable_useRelativeHref(target)
  // The link's text content is the raw hook result, so tests can assert the
  // exact relative form; clicking the link demonstrates that the href
  // resolves to the correct route. An intentionally unresolvable result
  // (literal '[param]' text) is rendered as a plain anchor because <Link>
  // rejects hrefs containing dynamic pattern text; those results are only
  // asserted as text, never clicked.
  if (href.includes('[')) {
    return (
      <div>
        <a className="relative-href" data-target={target} href={href}>
          {href}
        </a>
      </div>
    )
  }
  return (
    <div>
      <Link
        className="relative-href"
        data-target={target}
        href={href}
        prefetch={false}
      >
        {href}
      </Link>
    </div>
  )
}

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
        <RelativeHrefLink key={target} target={target} />
      ))}
    </div>
  )
}
