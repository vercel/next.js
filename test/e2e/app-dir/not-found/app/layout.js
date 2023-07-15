export default function Layout({ children }) {
  return (
    <html>
      <head />
      <body>
        <header>
          <nav id="layout-nav">Navbar</nav>
        </header>
        {children}
      </body>
    </html>
  )
}
