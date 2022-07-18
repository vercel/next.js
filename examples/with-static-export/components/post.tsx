import Link from 'next/link'
import { PostData } from '../types/postdata'

export default function Post({ title, body, id }: PostData) {
  return (
    <article>
      <h2>{title}</h2>
      <p>{body}</p>
      <Link href={`/post/${id}`}>
        <a>Read more...</a>
      </Link>
    </article>
  )
}
