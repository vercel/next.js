export default function Root({ headChildren, bodyChildren }) {
  return (
    <html className="this-is-the-document-html">
      <head>
        {headChildren}
        <title>Test</title>
      </head>
      <body className="this-is-the-document-body">{bodyChildren}</body>
    </html>
  )
}
