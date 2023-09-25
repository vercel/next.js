export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'sv' }]
}

export default function Template({ children }) {
  return <>{children}</>
}
