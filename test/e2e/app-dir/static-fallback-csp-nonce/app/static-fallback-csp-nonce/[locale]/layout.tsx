import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ locale: 'en' }]
}

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return (
    <section>
      <p id="locale">{locale}</p>
      {children}
    </section>
  )
}
