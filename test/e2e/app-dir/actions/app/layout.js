export default function RootLayout({ children }) {
  return (
    <html>
      <head />
      <body>
        <div id="random-number">{Math.random()}</div>
        {children}
      </body>
    </html>
  )
}
