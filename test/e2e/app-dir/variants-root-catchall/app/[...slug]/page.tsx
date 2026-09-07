import { Suspense, type JSX } from 'react'
import { theme } from '../../variants'

export function generateStaticParams(): Array<{ slug: string[] }> {
  return [{ slug: ['built'] }]
}

export function unstable_generateStaticVariants(): [typeof theme, string][][] {
  return [[[theme, 'dark']], [[theme, 'light']]]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}): Promise<JSX.Element> {
  const { slug } = await params

  return (
    <>
      <p id="slug">{slug.join('/')}</p>
      <Suspense fallback={<p id="theme-pending">pending</p>}>
        <p id="theme">{theme()}</p>
      </Suspense>
    </>
  )
}
