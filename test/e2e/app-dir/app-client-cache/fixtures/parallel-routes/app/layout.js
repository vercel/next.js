export default function Root({ children, breadcrumbs }) {
  return (
    <html>
      <head></head>
      <body>
        <div>{breadcrumbs}</div>
        <div id="root-layout">Root Layout</div>
        <div>{children}</div>
      </body>
    </html>
  )
}
