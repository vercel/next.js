export default function Layout(props: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <div>
      <div id="children">{props.children}</div>
      <div id="slot">{props.slot}</div>
    </div>
  )
}
