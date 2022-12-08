/* eslint-disable */

export const revalidate = -1

export default function Root({ test, invalid }) {
  return (
    <html className="this-is-the-document-html">
      <head>
        <title>Hello</title>
      </head>
      <body className="this-is-the-document-body">{test}</body>
    </html>
  )
}
