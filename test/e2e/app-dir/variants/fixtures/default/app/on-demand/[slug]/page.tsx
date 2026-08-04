import { Suspense } from 'react'

import { banner, theme } from '../../../variants'

export async function generateStaticParams() {
  return [{ slug: 'built' }]
}

export async function generateStaticVariants() {
  return [[[theme, 'dark']], [[theme, 'light']]]
}

// Declared by no combination, so this is the read that has to stay a hole. The
// route exists for the combination of properties that makes that hard: the param
// is awaited above every boundary, so the fallback shell is empty, so a param
// nobody enumerated is prerendered on demand and cached. That entry's key covers
// the param and the declared combination but not the banner, so baking the
// banner would serve the first request's value to every later one.
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
      <p id="theme">{await theme()}</p>
      <p id="slug">{slug}</p>
      <Suspense fallback={<p id="banner">pending</p>}>
        <Banner />
      </Suspense>
    </>
  )
}
