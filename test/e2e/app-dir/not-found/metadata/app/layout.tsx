export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export const metadata = {
  title: {
    template: '%s | My App',
    default: 'My App',
  },
  description: 'Root layout description',
}
