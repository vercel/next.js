import { Suspense } from 'react'

import { banner, locale, theme } from '../../../variants'

// Deliberately no `generateStaticParams`: every param is then a fallback param,
// so the fallback shell is the only thing prerendered here and an empty one is
// an error rather than something a concrete prerender makes up for. The
// combinations below are what let the shell be prerendered at all.
export async function generateStaticVariants() {
  return [
    [
      [theme, 'light'],
      [locale, 'en'],
    ],
    [
      [theme, 'dark'],
      [locale, 'en'],
    ],
  ]
}

async function Slug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return <p id="slug">{slug}</p>
}

// `banner` is declared by no combination, so it cannot be baked into any
// prerender and is read behind a boundary for the same reason the param is.
async function Banner() {
  return <p id="banner">{await banner()}</p>
}

// The param is awaited behind a boundary, so a fallback shell for this route
// keeps everything above it and only leaves a hole where the param goes. That
// is what makes the variants read above the boundary have to be resolvable
// while prerendering the shell. See `enumerated/[slug]` for the arrangement
// that yields an empty shell instead.
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <>
      <p id="theme">{await theme()}</p>
      <p id="locale">{await locale()}</p>
      <Suspense fallback={<p id="slug">pending</p>}>
        <Slug params={params} />
      </Suspense>
      <Suspense fallback={<p id="banner">pending</p>}>
        <Banner />
      </Suspense>
    </>
  )
}
