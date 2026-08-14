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

// The param is awaited behind a boundary, so a fallback shell for this route
// keeps everything above it and only leaves a hole where the param goes. It is
// therefore the only artifact this route has, and it must not be empty. See
// `enumerated/[slug]`, whose param is awaited above every boundary, for the
// arrangement whose fallback shell is empty and whose unnamed params are
// prerendered on demand instead.
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <>
      <Suspense fallback={<p id="theme">pending</p>}>
        <p id="theme">{theme()}</p>
      </Suspense>
      <Suspense fallback={<p id="locale">pending</p>}>
        <p id="locale">{locale()}</p>
      </Suspense>
      <Suspense fallback={<p id="slug">pending</p>}>
        <Slug params={params} />
      </Suspense>
      <Suspense fallback={<p id="banner">pending</p>}>
        <p id="banner">{banner()}</p>
      </Suspense>
    </>
  )
}
