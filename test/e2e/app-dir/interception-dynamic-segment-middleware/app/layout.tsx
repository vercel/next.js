export default function Layout(props: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <div>{props.children}</div>
      </body>
    </html>
  )
}
