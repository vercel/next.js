export default function Layout({ children, team, analytics }) {
  return (
    <html lang="en">
      <body>
        {children}
        {analytics}
        {team}
      </body>
    </html>
  )
}
