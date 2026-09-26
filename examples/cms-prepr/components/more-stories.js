import PostPreview from './post-preview'
import { toRouteSlug } from '@/lib/api'

export default function MoreStories({ posts }) {
  return (
    <section>
      <h2 className="mb-8 text-4xl font-bold leading-tight tracking-tight text-secondary-700 md:text-5xl">
        More Stories
      </h2>
      <div className="mb-32 grid grid-cols-1 gap-y-16 md:grid-cols-2 md:gap-x-12 md:gap-y-20">
        {posts.map((post) => (
          <PostPreview
            key={post._slug}
            title={post.title}
            coverImage={post.cover?.url}
            excerpt={post.excerpt}
            author={post.author}
            categories={post.categories}
            readTime={post._read_time}
            slug={toRouteSlug(post._slug)}
          />
        ))}
      </div>
    </section>
  )
}
