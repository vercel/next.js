export const dynamicParams = false

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'fr' }]
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
