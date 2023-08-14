import Link from 'next/link'
import './globals.css'
import { ThemeSwitcher } from 'nextjs-themes'
import { SSCWrapper } from 'nextjs-themes/server/nextjs'
import PageNavigator from './pageNavigator'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <SSCWrapper className="ssc-wrapper">
          <ThemeSwitcher />
          <div className="container">
            <header>
              <Link href="/">
                <h1>🏡</h1>
              </Link>{' '}
              <h1>Nextjs Themes Example</h1>
            </header>
            <p>
              Example showing how to use <code>nextjs-themes</code> to implement
              multi theme switching. More examples available at package's{' '}
              <a
                href="https://github.com/mayank1513/nextjs-themes"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub repo
              </a>
              .
            </p>
            <PageNavigator />
            <hr />
            {children}
          </div>
        </SSCWrapper>
      </body>
    </html>
  )
}
