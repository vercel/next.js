export default function Layout({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <html lang="en" className="layout">
      <body>
        {children}
        {slot}
      </body>
    </html>
  )
}

export const metadata = {
  title: 'layout title',
}
