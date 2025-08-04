export default async function Page(props: PageProps<'/docs/[...slug]'>) {
  const { slug } = await props.params

  return <p>docs {slug.join('/')}</p>
}
