export default async function Page(
  props: {
    params: Promise<any>
  }
) {
  const cloned = {...(await props.params)}
  return <div {...cloned} />
}
