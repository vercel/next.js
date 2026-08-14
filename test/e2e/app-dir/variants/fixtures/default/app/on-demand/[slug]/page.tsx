import { Suspense } from 'react'

import { banner, theme } from '../../../variants'

export async function generateStaticParams() {
  return [{ slug: 'built' }]
}

export async function generateStaticVariants() {
  return [[[theme, 'dark']], [[theme, 'light']]]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <>
      <Suspense fallback={<p id="theme">pending</p>}>
        <p id="theme">{theme()}</p>
      </Suspense>
      <p id="slug">{slug}</p>
      <Suspense fallback={<p id="banner">pending</p>}>
        <p id="banner">{banner()}</p>
      </Suspense>
    </>
  )
}
