import { Suspense, type JSX } from 'react'
import { lang } from 'next/root-params'
import { connection } from 'next/server'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { theme } from '../../../variants'

export function unstable_generateStaticVariants(): [typeof theme, string][][] {
  return [[[theme, 'dark']], [[theme, 'light']]]
}

async function VariantShell(): Promise<JSX.Element> {
  const language = await lang()
  const currentTheme = await theme()
  const phase =
    process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD ? 'buildtime' : 'runtime'

  return (
    <p id="variant-shell" data-language={language} data-theme={currentTheme}>
      {`shell:${language}:${currentTheme}:${phase}`}
    </p>
  )
}

async function Slug({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}): Promise<JSX.Element> {
  await connection()
  const { slug } = await params
  return <p id="slug">{slug}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}): JSX.Element {
  return (
    <>
      <Suspense fallback={<p id="variant-fallback">pending variant</p>}>
        <VariantShell />
      </Suspense>
      <Suspense fallback={<p id="slug-fallback">pending slug</p>}>
        <Slug params={params} />
      </Suspense>
    </>
  )
}
