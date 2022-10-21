/* eslint-disable */

export const revalidate = -1

export default function Root({ children }) {
  return (
    <html className="this-is-the-document-html">
      <head>
        <title>Hello</title>
      </head>
      <body className="this-is-the-document-body">{children}</body>
    </html>
  )
}
