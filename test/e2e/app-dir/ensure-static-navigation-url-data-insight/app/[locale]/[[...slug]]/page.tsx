import { notFound } from 'next/navigation'

const PAGES = ['', 'about']

export async function generateStaticParams() {
  return [
    { locale: 'en', slug: [] as string[] },
    { locale: 'en', slug: ['about'] },
  ]
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug?: string[] }>
}) {
  const { locale, slug } = await params
  const pathname = (slug ?? []).join('/')

  if (!PAGES.includes(pathname)) {
    notFound()
  }

  return (
    <main id="page">
      {locale}:{pathname || 'home'}
    </main>
  )
}
