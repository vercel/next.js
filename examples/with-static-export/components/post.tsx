import Link from 'next/link'
import { IPost } from '../@types/global'

export default function Post({ title, body, id }: IPost) {
  return (
    <article>
      <h2>{title}</h2>
      <p>{body}</p>
      <Link href={`/post/${id}`}>Read more...</Link>
    </article>
  )
}
