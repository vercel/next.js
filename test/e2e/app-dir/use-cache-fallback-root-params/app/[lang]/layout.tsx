export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'es' }]
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <h1>Language-independent shell</h1>
        {children}
      </body>
    </html>
  )
}
