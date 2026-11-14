import './globals.css'

// The root layout is `[locale]/layout.js`, so a URL that matches no route
// has no layout: this file is the whole 404 document.
export const metadata = {
  metadataBase: new URL('https://bench-static-realistic-site.example'),
  title: 'Page not found',
  description: 'The page you are looking for does not exist.',
}

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <main id="content" className="not-found">
          <h1>Page not found</h1>
          <p>The page you are looking for does not exist.</p>
          <a href="/en">Northfold Supply</a>
        </main>
      </body>
    </html>
  )
}
