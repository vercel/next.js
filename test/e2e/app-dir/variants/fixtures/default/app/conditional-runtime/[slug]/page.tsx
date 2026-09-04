import { Suspense } from 'react'

import { banner, theme } from '../../../variants'

export function generateStaticParams() {
  return [{ slug: 'built' }]
}

export function unstable_generateStaticVariants() {
  return [[[theme, 'dark']], [[theme, 'light']]]
}

async function Banner() {
  return <p id="banner">{await banner()}</p>
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <>
      <p id="slug">{slug}</p>
      <Suspense fallback={<p id="theme">pending</p>}>
        <p id="theme">{theme()}</p>
      </Suspense>
      {slug === 'runtime' ? (
        <Suspense fallback={<p id="banner">pending</p>}>
          <Banner />
        </Suspense>
      ) : null}
    </>
  )
}
