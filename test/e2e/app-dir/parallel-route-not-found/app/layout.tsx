export default function Layout(props: {
  children: React.ReactNode
  foo: React.ReactNode
  bar: React.ReactNode
}) {
  return (
    <html>
      <body>
        <div id="children">{props.children}</div>
        {props.foo}
        {props.bar}
      </body>
    </html>
  )
}
