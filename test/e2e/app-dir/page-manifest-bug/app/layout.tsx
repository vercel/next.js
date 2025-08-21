import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html>
      <head />
      <body>
        {children}
        <Script id="next-script-layout" />
      </body>
    </html>
  )
}
