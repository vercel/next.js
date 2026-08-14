export const dynamicParams = true

export function generateStaticParams() {
  return [{ lang: 'en-US' }, { lang: 'nl-NL' }]
}

export default function LangLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
