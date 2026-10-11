export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'de' }]
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
