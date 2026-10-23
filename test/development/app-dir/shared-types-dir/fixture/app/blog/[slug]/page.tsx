export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  return <p>{slug}</p>
}
