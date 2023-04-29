export const dynamicParams = false

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'fr' }]
}

export default function Layout({ children }) {
  return <>{children}</>
}
