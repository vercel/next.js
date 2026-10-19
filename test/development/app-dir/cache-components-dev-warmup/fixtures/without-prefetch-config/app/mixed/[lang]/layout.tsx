import { ReactNode, Suspense } from 'react'

// The layout logs the resolution stage of `lang` independently of `id`. Its
// `params` object contains only `lang`, so the staging check does not consider
// `id`.
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
