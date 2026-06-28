import { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'fr' }]
}

export default function LangLayout({ children }: { children: ReactNode }) {
  return children
}
