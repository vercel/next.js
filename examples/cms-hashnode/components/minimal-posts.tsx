import { PostFragment } from '../generated/graphql'
import { MinimalPostPreview } from './minimal-post-preview'

type Props = {
  posts: PostFragment[]
  context: 'home' | 'series' | 'tag'
}

export const MinimalPosts = ({ posts }: Props) => {
  return (
    <section className="flex w-full flex-col items-stretch gap-10 lg:max-w-lg">
      {posts.map((post) => (
        <MinimalPostPreview
          key={post.id}
          title={post.title}
          date={post.publishedAt}
          author={{
            name: post.author.name,
          }}
          slug={post.slug}
          commentCount={post.comments?.totalDocuments}
        />
      ))}
    </section>
  )
}
