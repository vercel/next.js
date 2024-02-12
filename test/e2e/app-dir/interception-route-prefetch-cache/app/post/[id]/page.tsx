export default function PostPage({
  params: { id },
}: {
  params: {
    id: string
  }
}) {
  return (
    <div>
      <h1>Post {id}</h1>
    </div>
  )
}
