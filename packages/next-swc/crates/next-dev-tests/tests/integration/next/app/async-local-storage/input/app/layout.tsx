import { cookies } from 'next/headers'

export default function RootLayout({ children }: { children: any }) {
  return (
    <html>
      <body>
        {JSON.stringify(cookies(), null, 2)}
        {children}
      </body>
    </html>
  )
}
