export default function Root({ children }) {
  return (
    <html className="this-is-the-document-html">
      <body className="this-is-the-document-body">{children}</body>
    </html>
  )
}
