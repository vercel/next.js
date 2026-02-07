export default async function Page(props: PageProps<'/gallery/photo/[id]'>) {
  const { id } = await props.params
  return <p>intercepted photo {id}</p>
}
