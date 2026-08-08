import { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <a href="/">home</a> <a href="/a">a</a> <a href="/b">b</a>{' '}
          <a href="/c">c</a> <a href="/d">d</a> <a href="/e">e</a>
        </nav>
        {children}
      </body>
    </html>
  )
}
