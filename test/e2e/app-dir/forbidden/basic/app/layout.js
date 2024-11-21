export default function Layout({ children }) {
  return (
    <html>
      <head />
      <body>
        <header>
          <nav id="layout-nav">Navbar</nav>
        </header>
        <main>{children}</main>
        <footer>
          <p id="layout-footer">Footer</p>
        </footer>
      </body>
    </html>
  )
}
