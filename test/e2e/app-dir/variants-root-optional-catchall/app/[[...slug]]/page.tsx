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
  params: Promise<{ slug?: string[] }>
}): Promise<JSX.Element> {
  const { slug } = await params
  const pathname = slug === undefined ? '/' : `/${slug.join('/')}`

  return (
    <Suspense fallback={<p>pending</p>}>
      <Content pathname={pathname} />
    </Suspense>
  )
}

async function Content({
  pathname,
}: {
  pathname: string
}): Promise<JSX.Element> {
  return <p id="result">{`${pathname}:${await theme()}`}</p>
}
