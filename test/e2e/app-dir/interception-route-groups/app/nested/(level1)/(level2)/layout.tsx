export default function Layout(props: {
  children: React.ReactNode
  intercepted: React.ReactNode
}) {
  return (
    <div>
      <div id="children">{props.children}</div>
      <div id="slot">{props.intercepted}</div>
    </div>
  )
}
