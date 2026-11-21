import Script from 'next/script'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Script
          id="layout-external"
          src="/external.js"
          strategy="beforeInteractive"
        />
        <Script
          id="layout-inline"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.executedScripts = (window.executedScripts || []).concat(
                window.externalLoaded ? 'layout-inline' : 'layout-inline-before-external'
              );
            `,
          }}
        />
        {children}
      </body>
    </html>
  )
}
