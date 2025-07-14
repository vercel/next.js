export default async function DocsPage(props: PageProps<'/docs/[...slug]'>) {
  const { slug } = await props.params
  return <div>Docs: {slug.join('/')}</div>
}
