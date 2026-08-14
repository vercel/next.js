import { Suspense } from 'react'

import { locale, theme } from '../../variants'

// This route declares combinations and is deliberately left out of the proxy's
// `config.matcher`, which is a misconfiguration a project can write today: the
// matcher and the table of variants per route are separate, and nothing makes
// them agree. The proxy therefore resolves nothing for a request here, and an
// honest request fails on the first read.
//
// It exists to hold that shape still, because the failure it causes is not the
// interesting one. A request that names a combination itself would otherwise be
// answered from that combination's prerender, and would succeed where the
// honest request fails.
//
// The variants transform removes the shape: it derives the matcher as the union
// of the user's own and every route that reads a variant, so a declaring route
// cannot be left out of it.
export async function generateStaticVariants() {
  return [
    [
      [theme, 'dark'],
      [locale, 'en'],
    ],
    [
      [theme, 'light'],
      [locale, 'en'],
    ],
  ]
}

export default async function Page() {
  return (
    <>
      <Suspense fallback={<p id="theme">pending</p>}>
        <p id="theme">{theme()}</p>
      </Suspense>
      <Suspense fallback={<p id="locale">pending</p>}>
        <p id="locale">{locale()}</p>
      </Suspense>
    </>
  )
}
