// Parallel route case, having multiple props
export default async function Layout(props) {
  const params = await props.params;

  const {
    modal,
    sidebar: Sidebar,
    ...rest
  } = props;

  f1(params.foo)
}
