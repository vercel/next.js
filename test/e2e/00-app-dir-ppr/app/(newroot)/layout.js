export default function Root({ children }) {
  return (
    <html className="this-is-another-document-html">
      <head>
        <title>{`hello world`}</title>
      </head>
      <body className="this-is-another-document-body">{children}</body>
    </html>
  )
}
