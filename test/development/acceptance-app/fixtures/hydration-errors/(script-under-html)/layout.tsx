import Script from 'next/script'

export default function Layout({ children }) {
  return (
    <html>
      <body>{children}</body>
      <Script
        src="https://example.com/script.js"
        strategy="beforeInteractive"
      />
    </html>
  )
}
