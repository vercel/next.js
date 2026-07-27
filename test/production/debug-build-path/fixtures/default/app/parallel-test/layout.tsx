export default function Layout(props: {
  children: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <div>
      {props.children}
      {props.sidebar}
    </div>
  )
}
