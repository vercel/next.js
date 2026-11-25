import { Suspense } from 'react'
import { LinkAccordion } from '../../../../../components/link-accordion'
import { ReplaceButton } from '../../../../../components/nav-buttons'

async function FeaturedContent({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  return (
    <main>
      <h1 id="heading">
        Featured {locale}/{slug}
      </h1>
      <LinkAccordion href={`/${locale}/f/women`}>Women</LinkAccordion>
      <div style={{ height: 5000 }}>Tall content</div>
      <footer>
        <ReplaceButton id="switch-locale" href="/de-de/f/herren" />
      </footer>
    </main>
  )
}

export default function FeaturedPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  return (
    <Suspense fallback={null}>
      <FeaturedContent params={params} />
    </Suspense>
  )
}
