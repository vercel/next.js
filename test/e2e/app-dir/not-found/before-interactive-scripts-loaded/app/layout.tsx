import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html>
      <head />
      <body>
        {children}

        <Script id="beforeInteractiveScript" strategy="beforeInteractive">
          {`window.__BEFORE_INTERACTIVE_CONTENT = "loaded"`}
        </Script>
      </body>
    </html>
  )
}
