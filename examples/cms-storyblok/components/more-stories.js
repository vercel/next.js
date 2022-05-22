import PostPreview from './post-preview'

export default function MoreStories({ posts }) {
  return (
    <section>
      <h2 className="mb-8 text-6xl md:text-7xl font-bold tracking-tighter leading-tight">
        More Stories
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-16 lg:gap-x-32 gap-y-20 md:gap-y-32 mb-32">
        {posts.map((post) => (
          <PostPreview
            key={post.slug}
            title={post.content.title}
            coverImage={post.content.image}
            date={post.first_published_at || post.published_at}
            author={post.content.author}
            slug={post.slug}
            excerpt={post.content.intro}
          />
        ))}
      </div>
    </section>
  )
}
