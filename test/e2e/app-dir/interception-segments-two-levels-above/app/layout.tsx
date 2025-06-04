export default function Layout(props: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <div id="children">{props.children}</div>
      </body>
    </html>
  )
}
