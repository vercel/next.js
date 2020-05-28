import PostPreview from '../components/post-preview'

export default function MoreStories({ title, posts }) {
  return (
    <section>
      <h2 className="mb-8 text-6xl md:text-7xl font-bold tracking-tighter leading-tight">
        {title}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 md:col-gap-16 lg:col-gap-32 row-gap-20 md:row-gap-32 mb-32">
        {posts.map((post) => (
          <PostPreview
            key={post.slug}
            title={post.title}
            coverImage={post.coverImage}
            date={post.date}
            author={post.author}
            slug={post.slug}
            excerpt={post.excerpt}
          />
        ))}
      </div>
    </section>
  )
}

// The data returned here will be send as `props` to the component
MoreStories.getCustomInitialProps = async function ({
  client,
  item,
  pageInSitemap,
}) {
  const postToExcludeContentID = pageInSitemap.contentID ?? -1
  const posts = await client.getPostsForMoreStories({ postToExcludeContentID })

  return {
    title: item.fields.title,
    posts,
  }
}
