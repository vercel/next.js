export default function Root({ children }) {
  return (
    <html>
      <body>
        <header>top bar</header>
        {children}
      </body>
    </html>
  )
}
