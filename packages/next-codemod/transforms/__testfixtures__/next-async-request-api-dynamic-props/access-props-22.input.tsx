export default function Page(props: {
  params: any
}) {
  const cloned = {...props.params}
  return <div {...cloned} />
}
