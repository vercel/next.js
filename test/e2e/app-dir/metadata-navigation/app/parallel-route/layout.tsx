export default function Layout({ children, header }) {
  return (
    <html>
      <head></head>
      <body>
        {header}
        {children}
      </body>
    </html>
  )
}

export const metadata = {
  title: 'Home Layout',
  description: 'this is the layout description',
  keywords: ['nextjs', 'react'],
}
