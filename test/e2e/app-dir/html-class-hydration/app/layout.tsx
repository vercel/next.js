export const metadata = { title: 'html-class-hydration' }

// The classic "no flash of incorrect theme" pattern: an inline script in the
// document <head> seeds a class (and attribute) onto <html> from localStorage
// before React hydrates. The server never renders this class, so it only
// exists in the DOM after this script runs. React must not strip it after
// hydration.
const seedScript = `try {
  var el = document.documentElement
  var theme = localStorage.getItem('theme') || 'dark'
  el.classList.add(theme)
  el.setAttribute('data-seeded', '1')
} catch (e) {}`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: seedScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
