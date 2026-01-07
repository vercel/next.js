export default function Layout(props: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <html>
      <body>
        <div id="children">{props.children}</div>
        {props.slot}
      </body>
    </html>
  )
}
