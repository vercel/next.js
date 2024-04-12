export default function Root({ children }) {
  return (
    <html>
      <head></head>
      <body>
        <div id="root-layout">Root Layout</div>
        <div>{children}</div>
      </body>
    </html>
  )
}
