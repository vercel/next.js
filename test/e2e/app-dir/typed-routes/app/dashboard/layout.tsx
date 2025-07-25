export default async function Layout(props: any) {
  // TODO
  const { analytics, team, children } = await props

  return (
    <div>
      <div>dashboard layout</div>
      <div>{analytics}</div>
      <div>{team}</div>
      <div>{children}</div>
    </div>
  )
}
