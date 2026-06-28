import { ReactNode, Suspense } from 'react'

export const instant = true
export const prefetch = 'allow-runtime'

// `lang` is covered by `generateStaticParams`. At this segment `params` only
// contains `lang`, so reading it here (rather than in the deeper page) lets us
// observe the stage `lang` resolves in independently of the uncovered `id`.
export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default function MixedLangLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ lang: string }>
}) {
  return (
    <>
      <Suspense fallback={<p>Waiting for lang...</p>}>
        <LangLabel params={params} />
      </Suspense>
      {children}
    </>
  )
}

async function LangLabel({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  console.log('after params - lang')
  return <p>lang: {lang}</p>
}
