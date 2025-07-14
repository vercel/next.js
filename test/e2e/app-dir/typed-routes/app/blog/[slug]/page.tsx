export default async function BlogPost(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  return <div>Blog post: {slug}</div>
}
