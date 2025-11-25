export default function BlogPost({ params }: { params: { slug: string } }) {
  return <div>Blog post: {params.slug}</div>
}
