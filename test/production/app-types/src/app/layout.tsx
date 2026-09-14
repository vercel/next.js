import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My App',
}

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <header>top bar</header>
        {children}
      </body>
    </html>
  )
}
