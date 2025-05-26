export default function RootLayout({ children, params }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

export function generateStaticParams() {
  return ['en', 'fr'].map((lang) => ({ lang }))
}
