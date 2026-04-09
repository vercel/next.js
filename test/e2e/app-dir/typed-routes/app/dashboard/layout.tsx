export default async function Layout(props: LayoutProps<'/dashboard'>) {
  const { analytics, team, children } = props

  return (
    <div>
      <div>dashboard layout</div>
      <div>{analytics}</div>
      <div>{team}</div>
      <div>{children}</div>
    </div>
  )
}
