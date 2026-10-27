export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer>
      <p>
        © {year} Pulse · <a href="/status">System status</a>
      </p>
    </footer>
  )
}
