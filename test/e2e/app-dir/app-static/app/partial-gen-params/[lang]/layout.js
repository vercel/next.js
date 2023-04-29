export function generateStaticParams() {
  if (typeof WebSocket === 'undefined') {
    throw new Error('missing WebSocket constructor!!')
  }

  return [{ lang: 'en' }, { lang: 'fr' }]
}

export default function Layout({ children }) {
  return <>{children}</>
}
