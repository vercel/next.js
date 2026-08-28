import type { ReactNode } from 'react'

export default async function ShopLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{
    locale: string
    isBot: string
    country: string
    currency: string
    measurement: string
  }>
}) {
  const { locale } = await params

  return (
    <main>
      <p id="locale">{locale}</p>
      {children}
    </main>
  )
}
