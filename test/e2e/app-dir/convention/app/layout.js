export default function Root({ children }) {
  return (
    <html>
      <head>
        <title>{`client entry directive`}</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
