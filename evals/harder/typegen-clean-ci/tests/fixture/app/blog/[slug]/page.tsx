export default async function BlogPost({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  return <h1>{slug}</h1>
}
