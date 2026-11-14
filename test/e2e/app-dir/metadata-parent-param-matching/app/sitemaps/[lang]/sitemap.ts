export const unstable_paramMatching = { lang: 'not-found' } as const

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'ja' }]
}

export function generateSitemaps() {
  if (arguments.length !== 0) {
    throw new Error('generateSitemaps must not receive parent params')
  }
  return []
}

export default async function Sitemap({ id }: { id: Promise<string> }) {
  return [{ url: `https://metadata-parent-param-matching.example/${await id}` }]
}
