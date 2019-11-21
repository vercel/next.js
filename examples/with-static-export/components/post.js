import Link from 'next/link'

export default ({ title, body, id }) => (
  <article>
    <h2>{title}</h2>
    <p>{body}</p>
    <Link href="/post/[id]" as={`/post/${id}`}>
      <a>Read more...</a>
    </Link>
  </article>
)
