import './style.css'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>Ridgeline / Everyday outdoors</header>
        <main>{children}</main>
      </body>
    </html>
  )
}
