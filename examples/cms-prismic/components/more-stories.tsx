import { Content } from '@prismicio/client'

import PostPreview from '../components/post-preview'

type MoreStoriesProps = {
  posts: Content.PostDocument[]
}

export default function MoreStories({ posts }: MoreStoriesProps) {
  return (
    <section>
      <h2 className="mb-8 text-6xl md:text-7xl font-bold tracking-tighter leading-tight">
        More Stories
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-16 lg:gap-x-32 gap-y-20 md:gap-y-32 mb-32">
        {posts.map((post) => (
          <PostPreview
            key={post.uid}
            href={post.url}
            title={post.data.title}
            coverImage={post.data.cover_image}
            date={post.data.date}
            author={post.data.author}
            excerpt={post.data.excerpt}
          />
        ))}
      </div>
    </section>
  )
}
