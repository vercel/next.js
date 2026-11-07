export default function GlobalNotFound() {
  return (
    // html tag is different from actual page's layout
    <html data-global-not-found="true">
      <body>
        <h1 id="global-error-title">global-not-found</h1>
      </body>
    </html>
  )
}
