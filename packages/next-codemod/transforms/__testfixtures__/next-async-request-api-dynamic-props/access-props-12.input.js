// Parallel route case, having multiple props
export default async function Layout({
  params,
  modal,
  sidebar: Sidebar,
  ...rest
}) {
  f1(params.foo)
}
