import type { Metadata } from 'next'

const languages = ['en', 'de', 'fi', 'ka', 'fr', 'es', 'it', 'pl', 'nl', 'pt']

export async function generateStaticParams() {
  return languages.map((lang) => ({ lang }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  await new Promise((resolve) => setTimeout(resolve, 25))
  return {
    title: `workStore locale ${lang}`,
    description: `static metadata for ${lang}`,
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  return <p id="locale">{lang}</p>
}
