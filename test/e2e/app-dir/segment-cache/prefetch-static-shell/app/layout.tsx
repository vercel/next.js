import { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <div>Root layout static text</div>
        {children}
      </body>
    </html>
  )
}
