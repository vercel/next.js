export default function Layout({ children }) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  )
}

export const metadata = {
  title: 'Next.js App',
}
