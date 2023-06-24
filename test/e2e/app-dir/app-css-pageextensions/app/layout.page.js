import '../styles/global.css'

export default function Root({ children }) {
  return (
    <html className="this-is-the-document-html">
      <head>
        <title>{`hello css`}</title>
      </head>
      <body className="this-is-the-document-body">{children}</body>
    </html>
  )
}
