export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'ja' }]
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
