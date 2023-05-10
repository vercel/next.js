export default function layout({ children }) {
  return (
    <html>
      <head></head>
      <body>
        <div className="group">{children}</div>
      </body>
    </html>
  )
}

export const metadata = {
  title: 'Group Title',
}
