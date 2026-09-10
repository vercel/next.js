import { Suspense, type JSX } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { theme } from '../variants'

export function unstable_generateStaticVariants(): [typeof theme, string][][] {
  return [[[theme, 'dark']], [[theme, 'light']]]
}

async function cachedByTheme(
  currentTheme: string
): Promise<{ currentTheme: string; renderedAt: string }> {
  'use cache'

  cacheTag('lifetime-root')
  cacheLife('hours')

  return { currentTheme, renderedAt: new Date().toISOString() }
}

async function Cached(): Promise<JSX.Element> {
  const cached = await cachedByTheme(await theme())

  return (
    <>
      <p id="theme">{cached.currentTheme}</p>
      <p id="rendered-at">{cached.renderedAt}</p>
    </>
  )
}

export default function Page(): JSX.Element {
  return (
    <Suspense fallback={<p id="cached">pending</p>}>
      <Cached />
    </Suspense>
  )
}
