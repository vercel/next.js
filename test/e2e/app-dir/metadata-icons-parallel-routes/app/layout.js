export default function Root({ children, modal }) {
  return (
    <html>
      <body>
        {modal}
        {children}
      </body>
    </html>
  )
}
