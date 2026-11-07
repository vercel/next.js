export const metadata = {
  title: { default: 'Layout default title', template: '%s | Site' },
  description: 'Layout description',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
